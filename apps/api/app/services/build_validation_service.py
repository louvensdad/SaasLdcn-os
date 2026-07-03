from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException, status

from app.core.config import BASE_DIR, get_settings
from app.schemas.generation_validation import BuildRuntimeMetrics, BuildValidationReport

# Receives partial execution-event dicts (type/command/cwd/stream/stdout/...). The
# caller (job engine) enriches them with id/jobId/timestamp/stage. None = no console.
EventSink = Callable[[dict[str, Any]], None]

try:  # Optional: enables peak-memory / CPU measurement of the build subprocess tree.
    import psutil
except ImportError:  # pragma: no cover - psutil is an optional dependency
    psutil = None  # type: ignore[assignment]


SECRET_LOG_RE = re.compile(
    r"(?i)(secret|token|password|api[_-]?key|private[_-]?key|credential)(\s*[=:]\s*)\S+"
)


class _MetricsCollector:
    """Accumulates REAL build-resource measurements across the install/build phases."""

    def __init__(self) -> None:
        self.install_ms = 0
        self.build_ms = 0
        self.total_ms = 0
        self.peak_mb = 0.0
        self.cpu_s = 0.0
        self.ran = False
        self.mem_measured = False
        self.sampler = "wallclock"

    def add(self, phase: str, ms: int, peak_mb: float | None, cpu_s: float | None, sampler: str) -> None:
        self.ran = True
        self.total_ms += ms
        if phase == "install":
            self.install_ms += ms
        elif phase == "build":
            self.build_ms += ms
        if sampler == "psutil":
            self.sampler = "psutil"
        if peak_mb is not None:
            self.peak_mb = max(self.peak_mb, peak_mb)
            self.mem_measured = True
        if cpu_s is not None:
            self.cpu_s = max(self.cpu_s, cpu_s)

    def finalize(self) -> BuildRuntimeMetrics | None:
        if not self.ran:
            return None
        return BuildRuntimeMetrics(
            install_ms=self.install_ms,
            build_ms=self.build_ms,
            total_ms=self.total_ms,
            peak_memory_mb=round(self.peak_mb, 1) if self.mem_measured else None,
            cpu_seconds=round(self.cpu_s, 2) if self.mem_measured else None,
            sampler=self.sampler,  # type: ignore[arg-type]
        )


class BuildValidationService:
    def __init__(self, timeout_seconds: int = 180) -> None:
        self.timeout_seconds = timeout_seconds
        self.workspace_root = BASE_DIR.parents[1].resolve()

    def validate(self, project: dict[str, Any], *, event_sink: EventSink | None = None) -> BuildValidationReport:
        root = self._project_root(project)
        if get_settings().force_mock:
            return self._skipped("Build validation skipped in mock mode.")
        collector = _MetricsCollector()
        try:
            report = self._dispatch(root, collector, event_sink)
        except subprocess.TimeoutExpired as exc:
            report = BuildValidationReport(
                installed="failed",
                built="skipped",
                ok=False,
                skipped_reason=f"Build validation timed out after {self.timeout_seconds}s.",
                logs_tail=self._tail((exc.stdout or "") + "\n" + (exc.stderr or "")),
            )
        report.metrics = collector.finalize()
        return report

    def _dispatch(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        targets: list[tuple[str, Path]] = []
        seen: set[tuple[str, Path]] = set()
        backend_candidates = ["", "apps/api", "backend"]
        catalogs = [
            ("python", "requirements.txt", backend_candidates),
            ("node", "package.json", ["", "apps/api", "apps/web", "frontend", "backend", "apps/mobile"]),
            ("maven", "pom.xml", backend_candidates),
            ("gradle", "build.gradle", backend_candidates),
            ("gradle", "build.gradle.kts", backend_candidates),
            ("go", "go.mod", backend_candidates),
            ("composer", "composer.json", backend_candidates),
            ("cargo", "Cargo.toml", backend_candidates),
        ]
        for ecosystem, manifest, candidates in catalogs:
            for candidate in candidates:
                candidate_root = (root / candidate).resolve()
                key = (ecosystem, candidate_root)
                if key not in seen and (candidate_root / manifest).is_file():
                    targets.append(key)
                    seen.add(key)
        # .NET manifests are project-named (*.sln / *.csproj), so detection is a
        # glob rather than a fixed filename.
        for candidate in backend_candidates:
            candidate_root = (root / candidate).resolve()
            key = ("dotnet", candidate_root)
            if key not in seen and candidate_root.is_dir() and (
                next(candidate_root.glob("*.sln"), None) or next(candidate_root.glob("*.csproj"), None)
            ):
                targets.append(key)
                seen.add(key)

        if targets:
            runners = {
                "python": self._python, "node": self._node, "maven": self._maven,
                "gradle": self._gradle, "go": self._go, "composer": self._composer,
                "cargo": self._cargo, "dotnet": self._dotnet,
            }
            reports: list[tuple[str, Path, BuildValidationReport]] = []
            for ecosystem, target in targets:
                reports.append((ecosystem, target, runners[ecosystem](target, collector, sink)))
            return self._combine_reports(root, reports)
        return BuildValidationReport(
            installed="skipped",
            built="skipped",
            ok=True,
            skipped_reason="No supported build manifest was emitted.",
        )

    def _combine_reports(
        self,
        root: Path,
        reports: list[tuple[str, Path, BuildValidationReport]],
    ) -> BuildValidationReport:
        def aggregate(field: str) -> str:
            values = [getattr(report, field) for _, _, report in reports]
            if "failed" in values:
                return "failed"
            if "passed" in values:
                return "passed"
            return "skipped"

        logs = []
        skipped = []
        for ecosystem, target, report in reports:
            label = target.relative_to(root).as_posix() or "."
            logs.append(f"[{ecosystem}:{label}]\n{report.logs_tail}")
            if report.skipped_reason:
                skipped.append(f"{ecosystem}:{label}: {report.skipped_reason}")
        ok = all(report.ok and not (report.skipped_reason and report.installed == "skipped") for _, _, report in reports)
        return BuildValidationReport(
            installed=aggregate("installed"),
            built=aggregate("built"),
            ok=ok,
            skipped_reason="; ".join(skipped) if not ok and skipped else None,
            logs_tail=self._tail("\n".join(logs)),
        )

    def _python(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        if shutil.which(sys.executable) is None:
            return self._skipped("Python executable is unavailable.")
        venv = root / ".ldcn-venv"
        create = self._run([sys.executable, "-m", "venv", str(venv)], root, collector, "install", sink)
        if create.returncode != 0:
            return self._failed_install(create)
        pip = venv / ("Scripts/pip.exe" if sys.platform.startswith("win") else "bin/pip")
        install = self._run([str(pip), "install", "-r", "requirements.txt"], root, collector, "install", sink)
        if install.returncode != 0:
            return self._failed_install(install)
        return BuildValidationReport(installed="passed", built="skipped", ok=True, logs_tail=self._tail(install.stdout + install.stderr))

    def _node(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        if not shutil.which("npm"):
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": "npm install",
                              "cwd": str(root), "message": "npm nao esta disponivel no servidor; build pulado.", "exitCode": 127})
            return self._skipped("npm is unavailable on the server.")
        install = self._run(["npm", "install"], root, collector, "install", sink)
        if install.returncode != 0:
            return self._failed_install(install)
        build_status = "skipped"
        build_result = None
        package = (root / "package.json").read_text(encoding="utf-8", errors="ignore")
        if '"build"' in package:
            build_result = self._run(["npm", "run", "build"], root, collector, "build", sink)
            build_status = "passed" if build_result.returncode == 0 else "failed"
        elif (root / "tsconfig.json").is_file():
            build_result = self._run(["npm", "exec", "tsc", "--", "--noEmit"], root, collector, "build", sink)
            build_status = "passed" if build_result.returncode == 0 else "failed"
        logs = install.stdout + install.stderr
        if build_result is not None:
            logs += "\n" + build_result.stdout + build_result.stderr
        return BuildValidationReport(
            installed="passed",
            built=build_status,
            ok=build_status != "failed",
            skipped_reason=None if build_status != "skipped" else "No build script or tsconfig.json was found.",
            logs_tail=self._tail(logs),
        )

    def _maven(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        return self._compile_ecosystem(root, collector, sink, tool="mvn", command=["mvn", "-q", "-DskipTests", "compile"])

    def _gradle(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        wrapper = root / ("gradlew.bat" if sys.platform.startswith("win") else "gradlew")
        if wrapper.is_file():
            command = [str(wrapper), "build", "-x", "test"]
            return self._compile_ecosystem(root, collector, sink, tool=str(wrapper), command=command, tool_available=True)
        return self._compile_ecosystem(root, collector, sink, tool="gradle", command=["gradle", "build", "-x", "test"])

    def _go(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        # `go build` resolves modules on demand, so install and build pass together.
        return self._compile_ecosystem(root, collector, sink, tool="go", command=["go", "build", "./..."])

    def _cargo(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        return self._compile_ecosystem(root, collector, sink, tool="cargo", command=["cargo", "build"])

    def _dotnet(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        # `dotnet build` restores packages by default (install + build in one pass).
        return self._compile_ecosystem(root, collector, sink, tool="dotnet", command=["dotnet", "build", "--nologo"])

    def _composer(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        if not shutil.which("composer"):
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": "composer install",
                              "cwd": str(root), "message": "composer nao esta disponivel no servidor; build pulado.", "exitCode": 127})
            return self._skipped("composer is unavailable on the server.")
        install = self._run(["composer", "install", "--no-interaction", "--no-progress"], root, collector, "install", sink)
        if install.returncode != 0:
            return self._failed_install(install)
        return BuildValidationReport(installed="passed", built="skipped", ok=True, logs_tail=self._tail(install.stdout + install.stderr))

    def _compile_ecosystem(
        self,
        root: Path,
        collector: _MetricsCollector,
        sink: EventSink | None,
        *,
        tool: str,
        command: list[str],
        tool_available: bool | None = None,
    ) -> BuildValidationReport:
        """Shared compile-style runner (maven/gradle/go/cargo/dotnet): dependency
        resolution and compilation happen in one command, so install/built pass or
        fail together. Missing toolchain skips gracefully, never fails the stage."""
        available = tool_available if tool_available is not None else bool(shutil.which(tool))
        if not available:
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": subprocess.list2cmdline(command),
                              "cwd": str(root), "message": f"{tool} nao esta disponivel no servidor; build pulado.", "exitCode": 127})
            return self._skipped(f"{tool} is unavailable on the server.")
        result = self._run(command, root, collector, "build", sink)
        if result.returncode != 0:
            return BuildValidationReport(installed="failed", built="failed", ok=False, logs_tail=self._tail(result.stdout + result.stderr))
        return BuildValidationReport(installed="passed", built="passed", ok=True, logs_tail=self._tail(result.stdout + result.stderr))

    def _run(
        self,
        command: list[str],
        root: Path,
        collector: _MetricsCollector | None = None,
        phase: str = "build",
        sink: EventSink | None = None,
    ) -> subprocess.CompletedProcess[str]:
        """Run a build subprocess, STREAMING its stdout/stderr line-by-line to the
        live console while measuring real wall-clock duration (always) plus peak
        memory / CPU of the process tree when psutil is available.

        Resolves the executable via shutil.which so Windows launchers (npm.cmd /
        mvn.cmd) run instead of raising WinError 2. A genuinely missing binary emits
        a clear command_skipped event and returns a synthetic failed result rather
        than crashing the pipeline thread."""
        display = subprocess.list2cmdline(command)
        cwd = str(root)
        exe = command[0]
        resolved = exe if os.path.isabs(exe) else (shutil.which(exe) or exe)
        full = [resolved, *command[1:]]

        self._emit(sink, {"type": "command_started", "command": display, "cwd": cwd, "message": f"$ {display}"})
        start = time.monotonic()
        try:
            popen = psutil.Popen if psutil is not None else subprocess.Popen
            proc = popen(full, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1)
        except FileNotFoundError:
            message = f"Executavel '{exe}' nao encontrado no PATH do servidor."
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": display,
                              "cwd": cwd, "message": message, "exitCode": 127})
            return subprocess.CompletedProcess(command, 127, "", message)

        out_lines: list[str] = []
        err_lines: list[str] = []

        def pump(pipe: Any, bucket: list[str], stream_name: str) -> None:
            try:
                for line in iter(pipe.readline, ""):
                    text = line.rstrip("\n")
                    bucket.append(text)
                    self._emit(sink, {"type": "command_output", "stream": stream_name,
                                      "level": "error" if stream_name == "stderr" else "info",
                                      "message": self._redact(text)})
            finally:
                try:
                    pipe.close()
                except OSError:
                    pass

        pumps = [
            threading.Thread(target=pump, args=(proc.stdout, out_lines, "stdout"), daemon=True),
            threading.Thread(target=pump, args=(proc.stderr, err_lines, "stderr"), daemon=True),
        ]
        for thread in pumps:
            thread.start()

        peak_bytes = 0
        cpu_seconds = 0.0
        stop = threading.Event()
        sampler = "wallclock"
        sample_thread: threading.Thread | None = None
        if psutil is not None:
            sampler = "psutil"

            def sample() -> None:
                nonlocal peak_bytes, cpu_seconds
                while not stop.is_set():
                    try:
                        procs = [proc, *proc.children(recursive=True)]
                        rss = 0
                        cpu = 0.0
                        for p in procs:
                            try:
                                rss += p.memory_info().rss
                                times = p.cpu_times()
                                cpu += times.user + times.system
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                continue
                        peak_bytes = max(peak_bytes, rss)
                        cpu_seconds = max(cpu_seconds, cpu)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                    stop.wait(0.1)

            sample_thread = threading.Thread(target=sample, daemon=True)
            sample_thread.start()

        timed_out = False
        try:
            proc.wait(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            proc.kill()
        finally:
            stop.set()
            for thread in pumps:
                thread.join(timeout=2.0)
            if sample_thread is not None:
                sample_thread.join(timeout=1.0)

        elapsed_ms = int((time.monotonic() - start) * 1000)
        if collector is not None:
            collector.add(
                phase, elapsed_ms,
                peak_bytes / (1024 * 1024) if psutil is not None else None,
                cpu_seconds if psutil is not None else None,
                sampler,
            )
        stdout = "\n".join(out_lines)
        stderr = "\n".join(err_lines)

        if timed_out:
            self._emit(sink, {"type": "command_finished", "level": "error", "command": display, "cwd": cwd,
                              "durationMs": elapsed_ms, "exitCode": None,
                              "message": f"Comando excedeu {self.timeout_seconds}s e foi encerrado.",
                              "stdout": self._tail(stdout), "stderr": self._tail(stderr)})
            raise subprocess.TimeoutExpired(command, self.timeout_seconds, output=stdout, stderr=stderr)

        self._emit(sink, {"type": "command_finished",
                          "level": "error" if proc.returncode != 0 else "info",
                          "command": display, "cwd": cwd, "durationMs": elapsed_ms, "exitCode": proc.returncode,
                          "message": f"Comando finalizado (exit {proc.returncode}) em {elapsed_ms} ms.",
                          "stdout": self._tail(stdout), "stderr": self._tail(stderr)})
        return subprocess.CompletedProcess(command, proc.returncode, stdout, stderr)

    @staticmethod
    def _emit(sink: EventSink | None, payload: dict[str, Any]) -> None:
        if sink is None:
            return
        try:
            sink(payload)
        except Exception:  # noqa: BLE001 — the console must never break the build
            pass

    def _redact(self, line: str) -> str:
        return SECRET_LOG_RE.sub(r"\1\2[redacted]", line)

    def _manifest_parent(self, root: Path, manifest: str, candidates: list[str]) -> Path | None:
        for relative in candidates:
            base = root / relative if relative else root
            if (base / manifest).is_file():
                return base
        matches = sorted(root.rglob(manifest), key=lambda path: len(path.parts))
        return matches[0].parent if matches else None

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw_path = project.get("generated_project_path")
        if not raw_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project has no generated project path.")
        root = Path(str(raw_path)).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project path does not exist.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project path must stay inside workspace.")
        return root

    def _skipped(self, reason: str) -> BuildValidationReport:
        return BuildValidationReport(installed="skipped", built="skipped", ok=True, skipped_reason=reason)

    def _failed_install(self, result: subprocess.CompletedProcess[str]) -> BuildValidationReport:
        return BuildValidationReport(installed="failed", built="skipped", ok=False, logs_tail=self._tail(result.stdout + result.stderr))

    def _tail(self, text: str, lines: int = 80) -> str:
        sanitized = SECRET_LOG_RE.sub(r"\1\2[redacted]", text)
        return "\n".join(sanitized.splitlines()[-lines:])


build_validation_service = BuildValidationService()
