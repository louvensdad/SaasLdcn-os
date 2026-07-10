from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote

from fastapi import HTTPException, status

from app.core.config import BASE_DIR, get_settings
from app.schemas.generation_validation import (
    BuildCommandRecord,
    BuildRepairAttempt,
    BuildRuntimeMetrics,
    BuildValidationReport,
    ClassifiedBuildErrorModel,
    ManualBuildFixGuide,
)
from app.services.build_error_classifier import ClassifiedBuildError, build_error_classifier, resolve_java_import
from app.services.dependency_registry import dependency_registry
from app.services.dependency_research_service import dependency_research_service
from app.services.stack_compatibility import stack_compatibility_engine
from app.services.tailwind_theme_guard import tailwind_theme_guard

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

# npm E404 shapes for a nonexistent package (LLM agents occasionally invent names,
# e.g. "@radix-ui/react-badge"). Both the human line and the GET URL are matched so
# the repair works across npm versions.
NPM_MISSING_SPEC_RE = re.compile(r"The requested resource '([^']+)' could not be found")
NPM_MISSING_URL_RE = re.compile(r"404\s+Not Found\s+-\s+GET\s+https://registry\.npmjs\.org/(\S+)")
_NPM_MANIFEST_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

# javac error lines look like "[ERROR] /abs/path/Module.java:[12,34] ...". The file
# path pins down which reactor module actually failed, independent of whether the
# "-rf :module" resume hint is present in the log.
_JAVA_ERROR_FILE_RE = re.compile(r"\[ERROR\]\s+(\S+?\.java):\[\d+,\d+\]")

# One initial command plus exactly two bounded recovery opportunities. The first
# repair uses the complete deterministic policy; the second uses the conservative
# simplified policy. A fourth command execution is structurally impossible.
MAX_AUTO_REPAIR_ATTEMPTS = 2
MAX_REPAIRS_PER_ERROR = MAX_AUTO_REPAIR_ATTEMPTS
MAX_ATTEMPTS_PER_PHASE = 1 + MAX_AUTO_REPAIR_ATTEMPTS


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
                built="skipped_after_failure",
                ok=False,
                skipped_reason=f"Build validation timed out after {self.timeout_seconds}s.",
                logs_tail=self._tail((exc.stdout or "") + "\n" + (exc.stderr or "")),
                recovery_status="SKIPPED_AFTER_FAILURE",
            )
        if not report.ok and report.recovery_status != "SKIPPED_AFTER_FAILURE":
            report.built = "skipped_after_failure"
            report.recovery_status = "SKIPPED_AFTER_FAILURE"
            report.skipped_reason = report.skipped_reason or "Build skipped after the bounded recovery policy failed."
        if report.recovery_status == "SKIPPED_AFTER_FAILURE" and report.manual_fix_guide is None:
            report.manual_fix_guide = self._manual_fix_guide(root, [], [], None, report.logs_tail)
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
            if "skipped_after_failure" in values:
                return "skipped_after_failure"
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
        # Merge the auto-repair audit trails: every command/repair from every
        # ecosystem target, and the first classified error of a failing target.
        commands = [item for _, _, report in reports for item in report.commands]
        repairs = [item for _, _, report in reports for item in report.repairs]
        classified = next((report.classified_error for _, _, report in reports if report.classified_error), None)
        dependency_validation = next(
            (report.dependency_validation for _, _, report in reports if report.dependency_validation), None
        )
        stack_compatibility = next(
            (report.stack_compatibility for _, _, report in reports if report.stack_compatibility), None
        )
        manual_fix_guide = next(
            (report.manual_fix_guide for _, _, report in reports if report.manual_fix_guide), None
        )
        recovery_status = next(
            (report.recovery_status for _, _, report in reports if report.recovery_status), None
        )
        return BuildValidationReport(
            installed=aggregate("installed"),
            built=aggregate("built"),
            ok=ok,
            skipped_reason="; ".join(skipped) if not ok and skipped else None,
            logs_tail=self._tail("\n".join(logs)),
            commands=commands,
            repairs=repairs,
            classified_error=classified,
            dependency_validation=dependency_validation,
            stack_compatibility=stack_compatibility,
            recovery_status=recovery_status,
            manual_fix_guide=manual_fix_guide,
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

        commands: list[dict[str, Any]] = []
        repairs: list[dict[str, Any]] = []
        error_counts: dict[str, int] = {}

        # Dependency Registry gate: validate + auto-fix the manifest BEFORE the
        # first npm install so invented packages (@radix-ui/react-badge) never
        # reach the registry. Writes dependency.validation.json at the root.
        dep_result = dependency_registry.validate_and_fix(root, sink=sink)
        dep_validation = dep_result.as_dict() if dep_result.status != "skipped" else None
        if dep_result.repaired:
            fixed = [f.package for f in dep_result.findings if f.status == "fixed"]
            self._emit(sink, {
                "type": "repair_applied", "level": "warning",
                "message": (
                    "Dependency Registry: dependencia(s) inexistente(s) corrigida(s) antes do install: "
                    + ", ".join(fixed) + "."
                ),
            })

        # Stack Compatibility Engine: capture/load the Stack Lock, restore any
        # anchor drift, and move ecosystem packages that are incompatible with
        # the locked React major to matrix-suggested versions (Auto Version
        # Fixer) — BEFORE npm resolves anything. Writes stack.lock.json +
        # stack.compatibility.json at the project root.
        compat_result = stack_compatibility_engine.validate_and_fix(root, sink=sink)
        compat_report = compat_result.as_dict() if compat_result.status != "skipped" else None
        if compat_result.fixed:
            adjusted = ", ".join(
                f"{item.package} {item.current} -> {item.suggested}"
                for item in compat_result.findings if item.status in {"fixed", "lock_enforced"}
            )
            self._emit(sink, {
                "type": "repair_applied", "level": "warning",
                "message": f"Stack Compatibility: versao(oes) incoerente(s) com a stack travada ajustada(s) antes do install: {adjusted}.",
            })

        # Tailwind Theme Guard: complete tailwind.config.ts's shadcn/ui color
        # tokens BEFORE the build ever runs, when globals.css declares the
        # shadcn CSS-variable convention but the config never wires it up
        # (the recurring "the `border-border` class does not exist" failure).
        theme_result = tailwind_theme_guard.validate_and_fix(root, sink=sink)
        if theme_result.fixed:
            added = ", ".join(f.token for f in theme_result.findings if f.status == "added")
            self._emit(sink, {
                "type": "repair_applied", "level": "warning",
                "message": f"Tailwind Theme Guard: token(s) de cor do shadcn/ui ausente(s) em tailwind.config.ts adicionado(s) antes do build: {added}.",
            })

        # Preflight Build Check (Build Guard): SIMULATE the install first.
        # `npm install --dry-run` resolves the full dependency tree without
        # writing node_modules, so a predictable conflict (ERESOLVE, E404,
        # ETARGET) is caught — and repaired — before the real install/build.
        classified: ClassifiedBuildError | None = None
        preflight, classified = self._install_phase(
            root, collector, sink, commands, repairs, error_counts,
            command=["npm", "install", "--dry-run"], record_phase="preflight",
        )
        if preflight.returncode != 0:
            report = self._failed_install(preflight)
            return self._failed_with_guide(root, report, commands, repairs, classified, dep_validation, compat_report)

        # ------------------------------------------------------ install + repair
        install, classified = self._install_phase(
            root, collector, sink, commands, repairs, error_counts,
            command=["npm", "install"], record_phase="install",
        )
        if install.returncode != 0:
            report = self._failed_install(install)
            return self._failed_with_guide(root, report, commands, repairs, classified, dep_validation, compat_report)
        classified = None

        # -------------------------------------------------------- build + repair
        build_status = "skipped"
        build_result: subprocess.CompletedProcess[str] | None = None
        build_attempts = 0
        while build_attempts < MAX_ATTEMPTS_PER_PHASE:
            build_cmd = self._node_build_command(root)
            if build_cmd is None:
                break
            build_result = self._run(build_cmd, root, collector, "build", sink, records=commands, record_phase="build")
            build_attempts += 1
            if build_result.returncode == 0:
                build_status = "passed"
                classified = None
                break
            build_status = "failed"
            logs = build_result.stdout + build_result.stderr
            classified = build_error_classifier.classify(logs)
            if classified is None:
                break
            signature = f"{classified.code}:{classified.package or '-'}"
            error_counts[signature] = error_counts.get(signature, 0) + 1
            if error_counts[signature] > MAX_REPAIRS_PER_ERROR:
                break
            strategy = "standard" if build_attempts == 1 else "simplified"
            self._emit(sink, {"type": "repair_started", "level": "warning",
                              "message": f"Auto-reparo {strategy}: {classified.message} Causa raiz: {classified.root_cause}"})
            patch, applied, detail = self._repair_build_error(
                root, collector, classified, sink, commands, simplified=strategy == "simplified"
            )
            repairs.append({
                "phase": "build", "attempt": len(repairs) + 1,
                "strategy": strategy, "error": classified.as_dict(), "patch": patch, "applied": applied, "detail": detail,
            })
            self._emit(sink, {
                "type": "repair_applied" if applied else "repair_failed",
                "level": "warning" if applied else "error",
                "message": (f"Patch aplicado: {patch}" if applied else f"Sem correcao automatica segura: {classified.suggested_fix}"),
            })
            if not applied:
                break

        logs = install.stdout + install.stderr
        if build_result is not None:
            logs += "\n" + build_result.stdout + build_result.stderr
        if repairs:
            notes = "\n".join(
                f"[auto-repair] {item['error']['message']} Patch: {item['patch'] or 'nenhum'} ({'aplicado' if item['applied'] else 'nao aplicado'})"
                for item in repairs
            )
            logs = f"{notes}\n{logs}"
        exhausted = build_status == "failed"
        report = BuildValidationReport(
            installed="passed",
            built="skipped_after_failure" if exhausted else build_status,
            ok=not exhausted,
            skipped_reason=(
                "Build skipped after two automatic recovery attempts."
                if exhausted else None if build_status != "skipped" else "No build script or tsconfig.json was found."
            ),
            logs_tail=self._tail(logs),
            recovery_status="SKIPPED_AFTER_FAILURE" if exhausted else None,
        )
        attached = self._attach_audit(
            report, commands, repairs, classified if exhausted else None, dep_validation, compat_report
        )
        if exhausted:
            attached.manual_fix_guide = self._manual_fix_guide(root, commands, repairs, classified, logs)
        return attached

    def _install_phase(
        self,
        root: Path,
        collector: _MetricsCollector,
        sink: EventSink | None,
        commands: list[dict[str, Any]],
        repairs: list[dict[str, Any]],
        error_counts: dict[str, int],
        *,
        command: list[str],
        record_phase: str,
    ) -> tuple[subprocess.CompletedProcess[str], ClassifiedBuildError | None]:
        """Run one install-style command (preflight --dry-run or the real
        install) under the bounded auto-repair loop: classify the failure,
        enrich ERESOLVE with the Stack Compatibility diagnosis, apply the safe
        patch and re-run — max MAX_REPAIRS_PER_ERROR per distinct error and
        MAX_ATTEMPTS_PER_PHASE commands per phase."""
        result = self._run(command, root, collector, "install", sink, records=commands, record_phase=record_phase)
        attempts = 1
        classified: ClassifiedBuildError | None = None
        current = list(command)
        while result.returncode != 0 and attempts < MAX_ATTEMPTS_PER_PHASE:
            logs = result.stdout + result.stderr
            classified = build_error_classifier.classify(logs)
            if classified is None:
                break
            if classified.code == "npm_peer_dependency_conflict":
                conflict = stack_compatibility_engine.diagnose_peer_conflict(logs, root)
                if conflict is not None:
                    classified = classified.with_conflict(
                        conflict.as_dict(),
                        message=(
                            f"Conflito de versao: {conflict.package}@{conflict.package_version} exige "
                            f"{conflict.requires}, mas a stack travada usa {conflict.anchor}@{conflict.anchor_version}."
                        ),
                        root_cause=conflict.reason,
                        suggested_fix=(
                            f"Ajustar {conflict.package} para {conflict.suggested}. Impacto: {conflict.impact}"
                            if conflict.suggested
                            else f"Decisao do usuario necessaria. {conflict.impact}"
                        ),
                        auto_fixable=not conflict.requires_user_decision,
                    )
            signature = f"{classified.code}:{classified.package or '-'}"
            error_counts[signature] = error_counts.get(signature, 0) + 1
            if error_counts[signature] > MAX_REPAIRS_PER_ERROR:
                break
            strategy = "standard" if attempts == 1 else "simplified"
            self._emit(sink, {"type": "repair_started", "level": "warning",
                              "message": f"Auto-reparo {strategy}: {classified.message} Causa raiz: {classified.root_cause}"})
            patch, applied, detail, replacement_cmd = self._repair_install_error(
                root, classified, logs, sink, simplified=strategy == "simplified"
            )
            repairs.append({
                "phase": record_phase, "attempt": len(repairs) + 1,
                "strategy": strategy, "error": classified.as_dict(), "patch": patch, "applied": applied, "detail": detail,
            })
            self._emit(sink, {
                "type": "repair_applied" if applied else "repair_failed",
                "level": "warning" if applied else "error",
                "message": (f"Patch aplicado: {patch}" if applied else f"Sem correcao automatica segura: {classified.suggested_fix}"),
            })
            if not applied:
                break
            if replacement_cmd is not None:
                current = replacement_cmd
            result = self._run(current, root, collector, "install", sink, records=commands, record_phase=record_phase)
            attempts += 1
        if result.returncode == 0:
            classified = None
        return result, classified

    def _node_build_command(self, root: Path) -> list[str] | None:
        package = (root / "package.json").read_text(encoding="utf-8", errors="ignore")
        if '"build"' in package:
            return ["npm", "run", "build"]
        if (root / "tsconfig.json").is_file():
            return ["npm", "exec", "tsc", "--", "--noEmit"]
        return None

    def _repair_install_error(
        self, root: Path, classified: ClassifiedBuildError, logs: str, sink: EventSink | None,
        *, simplified: bool = False,
    ) -> tuple[str | None, bool, str, list[str] | None]:
        """Apply the safe deterministic patch for a classified install failure.
        Returns (patch description, applied?, detail, replacement install command)."""
        if classified.code in {"npm_package_not_found", "invalid_package_name"}:
            if classified.package:
                record = dependency_registry.fix_missing_package(root, classified.package, sink=sink)
                if record is not None:
                    detail_parts = []
                    if record.files_written:
                        detail_parts.append("criado: " + ", ".join(record.files_written))
                    if record.files_rewritten:
                        detail_parts.append("imports atualizados: " + ", ".join(record.files_rewritten))
                    return record.patch, True, "; ".join(detail_parts), None
            removed = self._strip_missing_npm_packages(root, logs, sink)
            if removed:
                return f"Dependencia(s) removida(s) do package.json: {', '.join(removed)}.", True, "", None
            return None, False, "Pacote ofensor nao localizado em nenhum package.json.", None
        if classified.code == "npm_version_not_found" and classified.package:
            if simplified:
                return None, False, "Modo simplificado nao consulta novas versoes no registro.", None
            new_version = self._fix_npm_version(root, classified.package)
            if new_version:
                return f"Versao de '{classified.package}' ajustada para {new_version}.", True, "", None
            return None, False, f"'{classified.package}' nao encontrado em nenhum package.json.", None
        if classified.code == "npm_peer_dependency_conflict":
            # Build Guard: ERESOLVE is resolved by moving the CONFLICTING package
            # to the matrix-compatible version — never by forcing the install
            # (--legacy-peer-deps would hide the incoherence) and never by
            # changing a locked anchor (React) without the user's approval.
            conflict = stack_compatibility_engine.diagnose_peer_conflict(logs, root)
            if conflict is None:
                return None, False, "Conflito ERESOLVE nao pode ser diagnosticado automaticamente.", None
            if conflict.requires_user_decision:
                return None, False, conflict.impact, None
            if stack_compatibility_engine.apply_conflict_fix(root, conflict):
                return (
                    f"'{conflict.package}' ajustado de {conflict.package_version} para {conflict.suggested} "
                    f"(compativel com {conflict.anchor}@{conflict.anchor_version}).",
                    True,
                    conflict.impact,
                    None,
                )
            return None, False, f"'{conflict.package}' nao encontrado em nenhum package.json.", None
        return None, False, "Erro sem correcao deterministica segura.", None

    def _repair_build_error(
        self, root: Path, collector: _MetricsCollector, classified: ClassifiedBuildError,
        sink: EventSink | None, commands: list[dict[str, Any]],
        *, simplified: bool = False,
    ) -> tuple[str | None, bool, str]:
        """Safe deterministic patches for classified BUILD failures. Only
        module-resolution problems have one: a forbidden/invented module is
        replaced by its local component (imports rewritten); a real missing npm
        package is added to the manifest and installed."""
        if classified.code != "module_not_found" or not classified.package:
            return None, False, "Erro sem correcao deterministica segura."
        package = classified.package
        if dependency_registry.is_forbidden(package):
            record = dependency_registry.fix_missing_package(root, package, sink=sink)
            known = dependency_registry.bad_package(package)
            if record is None and known and known.import_replacement:
                # Not in the manifest anymore, but a source file still imports it.
                rewritten = dependency_registry._rewrite_imports(root, root, package, known.import_replacement)  # noqa: SLF001
                if known.local_component and known.local_component_content:
                    component = root / known.local_component
                    if not component.is_file():
                        component.parent.mkdir(parents=True, exist_ok=True)
                        component.write_text(known.local_component_content, encoding="utf-8")
                if rewritten:
                    return known.fix, True, "imports atualizados: " + ", ".join(rewritten)
            if record is not None:
                return record.patch, True, "",
            return None, False, f"Nenhum uso de '{package}' localizado para corrigir."
        if simplified:
            return None, False, "Modo simplificado nao adiciona dependencias novas ao projeto."
        version = self._registry_latest(package)
        if version is None:
            return None, False, f"'{package}' nao foi confirmado no registro npm; nada adicionado."
        added = self._add_npm_dependency(root, package, version)
        if not added:
            return None, False, "package.json nao encontrado para adicionar a dependencia."
        install = self._run(["npm", "install"], root, collector, "install", sink, records=commands, record_phase="install")
        if install.returncode != 0:
            return f"Dependencia '{package}@^{version}' adicionada, mas o install falhou.", False, self._tail(install.stdout + install.stderr, 10)
        return f"Dependencia real '{package}@^{version}' adicionada ao package.json e instalada.", True, ""

    def _fix_npm_version(self, root: Path, package: str) -> str | None:
        """ETARGET repair: point the requested version at the latest published one."""
        lookup_version = self._registry_latest(package)
        new_version = f"^{lookup_version}" if lookup_version else "latest"
        for manifest in sorted(root.rglob("package.json"), key=lambda path: len(path.parts)):
            if "node_modules" in manifest.parts:
                continue
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            changed = False
            for section in _NPM_MANIFEST_SECTIONS:
                deps = data.get(section)
                if isinstance(deps, dict) and package in deps:
                    deps[package] = new_version
                    changed = True
            if changed:
                manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                lock = manifest.parent / "package-lock.json"
                if lock.is_file():
                    lock.unlink()
                return new_version
        return None

    def _add_npm_dependency(self, root: Path, package: str, version: str) -> bool:
        manifest = root / "package.json"
        if not manifest.is_file():
            return False
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        deps = data.get("dependencies")
        if not isinstance(deps, dict):
            deps = {}
            data["dependencies"] = deps
        deps[package] = f"^{version}"
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return True

    def _registry_latest(self, package: str) -> str | None:
        try:
            lookup = dependency_research_service.latest_npm(package)
        except Exception:  # noqa: BLE001 — registry probe is best-effort
            return None
        return lookup.latest_version

    @staticmethod
    def _attach_audit(
        report: BuildValidationReport,
        commands: list[dict[str, Any]],
        repairs: list[dict[str, Any]],
        classified: ClassifiedBuildError | None,
        dep_validation: dict[str, Any] | None,
        stack_compatibility: dict[str, Any] | None = None,
    ) -> BuildValidationReport:
        report.commands = [BuildCommandRecord.model_validate(item) for item in commands]
        report.repairs = [BuildRepairAttempt.model_validate(item) for item in repairs]
        report.classified_error = (
            ClassifiedBuildErrorModel.model_validate(classified.as_dict()) if classified else None
        )
        report.dependency_validation = dep_validation
        report.stack_compatibility = stack_compatibility
        return report

    def _failed_with_guide(
        self,
        root: Path,
        report: BuildValidationReport,
        commands: list[dict[str, Any]],
        repairs: list[dict[str, Any]],
        classified: ClassifiedBuildError | None,
        dependency_validation: dict[str, Any] | None,
        stack_compatibility: dict[str, Any] | None,
    ) -> BuildValidationReport:
        report.built = "skipped_after_failure"
        report.ok = False
        report.recovery_status = "SKIPPED_AFTER_FAILURE"
        report.skipped_reason = "Build skipped after the bounded automatic recovery policy was exhausted."
        attached = self._attach_audit(
            report, commands, repairs, classified, dependency_validation, stack_compatibility
        )
        attached.manual_fix_guide = self._manual_fix_guide(
            root, commands, repairs, classified, report.logs_tail
        )
        return attached

    def _manual_fix_guide(
        self,
        root: Path,
        commands: list[dict[str, Any]],
        repairs: list[dict[str, Any]],
        classified: ClassifiedBuildError | None,
        fallback_logs: str,
        *,
        ecosystem: str = "node",
    ) -> ManualBuildFixGuide:
        conflict = classified.conflict if classified and isinstance(classified.conflict, dict) else {}
        dependencies = {
            str(value)
            for value in (
                classified.package if classified else None,
                conflict.get("package"),
                conflict.get("anchor"),
            )
            if value
        }
        suggestions: dict[str, str] = {}
        if conflict.get("package") and conflict.get("suggested"):
            suggestions[str(conflict["package"])] = str(conflict["suggested"])

        if ecosystem == "maven":
            affected = sorted(
                path.relative_to(root).as_posix()
                for path in root.rglob("pom.xml")
                if "target" not in path.parts
            )
            command_list = ["mvn -q -DskipTests compile"]
        else:
            affected = sorted(
                path.relative_to(root).as_posix()
                for path in root.rglob("package.json")
                if "node_modules" not in path.parts
            )
            command_list = ["npm install"]
            command_list.extend(
                f"npm install {package}@{version}" for package, version in suggestions.items()
            )
            command_list.append("npm run build")
        patches = [str(item["patch"]) for item in repairs if item.get("patch")]

        log_blocks: list[str] = []
        for item in commands:
            stdout = str(item.get("stdout") or item.get("stdout_tail") or "")
            stderr = str(item.get("stderr") or item.get("stderr_tail") or "")
            log_blocks.append(
                f"$ {item.get('command', '')}\n{stdout}\n{stderr}".strip()
            )
        full_logs = self._redact("\n\n".join(log_blocks) or fallback_logs)
        original_error = (
            classified.message if classified else next(
                (line for line in reversed(full_logs.splitlines()) if line.strip()),
                "Build command failed.",
            )
        )
        root_cause = classified.root_cause if classified else "The build command failed after bounded recovery."
        return ManualBuildFixGuide(
            root_cause=root_cause,
            original_error=original_error,
            affected_files=affected,
            problematic_dependencies=sorted(dependencies),
            suggested_versions=suggestions,
            commands=command_list,
            steps=[
                "Review the original error and the complete command logs.",
                "Open the affected manifests and verify the dependency compatibility range.",
                "Apply the suggested version change or revert the recorded automatic patches.",
                "Run the install command and then the build command locally.",
                "Return to Meta-Factory and run the manual build retry once the local build passes.",
            ],
            patches_applied=patches,
            full_logs=full_logs,
        )

    def _strip_missing_npm_packages(self, root: Path, logs: str, sink: EventSink | None) -> list[str]:
        """Remove npm-E404 (nonexistent) packages from package.json so the caller can
        retry the install. Returns the removed names ([] when there is nothing to
        repair, e.g. the failure was network- or engine-related, not a bad name)."""
        names: set[str] = set()
        for spec in NPM_MISSING_SPEC_RE.findall(logs):
            # '@scope/name@^1.0.0' -> '@scope/name'; a leading '@' is never a separator.
            names.add(spec.rsplit("@", 1)[0] if spec.rfind("@") > 0 else spec)
        for encoded in NPM_MISSING_URL_RE.findall(logs):
            names.add(unquote(encoded).strip("'\""))
        if not names:
            return []
        manifest = root / "package.json"
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        removed: list[str] = []
        for section in _NPM_MANIFEST_SECTIONS:
            deps = data.get(section)
            if not isinstance(deps, dict):
                continue
            for name in sorted(names):
                if name in deps:
                    deps.pop(name)
                    removed.append(name)
        if not removed:
            return []
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        # A stale lockfile would keep resolving the removed package on retry.
        lock = root / "package-lock.json"
        if lock.is_file():
            lock.unlink()
        for name in removed:
            self._emit(sink, {
                "type": "command_output", "stream": "stderr", "level": "warning",
                "message": f"Auto-reparo: '{name}' nao existe no registro npm (E404); dependencia removida do package.json e o install sera repetido.",
            })
        return removed

    def _maven(self, root: Path, collector: _MetricsCollector, sink: EventSink | None = None) -> BuildValidationReport:
        """Compile with the same bounded auto-repair policy as the npm build loop:
        a missing pom.xml dependency ('package X does not exist') is resolved to a
        Maven coordinate and added to the failing module's pom.xml, then the compile
        is retried. Unlike npm, Maven has no separate install phase - resolution and
        compilation happen in one `mvn compile`, so both stages pass or fail together."""
        if not shutil.which("mvn"):
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": "mvn -q -DskipTests compile",
                              "cwd": str(root), "message": "mvn nao esta disponivel no servidor; build pulado.", "exitCode": 127})
            return self._skipped("mvn is unavailable on the server.")

        commands: list[dict[str, Any]] = []
        repairs: list[dict[str, Any]] = []
        error_counts: dict[str, int] = {}
        command = ["mvn", "-q", "-DskipTests", "compile"]

        result = self._run(command, root, collector, "build", sink, records=commands, record_phase="build")
        attempts = 1
        classified: ClassifiedBuildError | None = None
        while result.returncode != 0 and attempts < MAX_ATTEMPTS_PER_PHASE:
            logs = result.stdout + result.stderr
            classified = build_error_classifier.classify(logs)
            if classified is None:
                break
            signature = f"{classified.code}:{classified.package or '-'}"
            error_counts[signature] = error_counts.get(signature, 0) + 1
            if error_counts[signature] > MAX_REPAIRS_PER_ERROR:
                break
            strategy = "standard" if attempts == 1 else "simplified"
            self._emit(sink, {"type": "repair_started", "level": "warning",
                              "message": f"Auto-reparo {strategy}: {classified.message} Causa raiz: {classified.root_cause}"})
            patch, applied, detail = self._repair_maven_error(root, classified, logs, sink, simplified=strategy == "simplified")
            repairs.append({
                "phase": "build", "attempt": len(repairs) + 1,
                "strategy": strategy, "error": classified.as_dict(), "patch": patch, "applied": applied, "detail": detail,
            })
            self._emit(sink, {
                "type": "repair_applied" if applied else "repair_failed",
                "level": "warning" if applied else "error",
                "message": (f"Patch aplicado: {patch}" if applied else f"Sem correcao automatica segura: {classified.suggested_fix}"),
            })
            if not applied:
                break
            result = self._run(command, root, collector, "build", sink, records=commands, record_phase="build")
            attempts += 1
            if result.returncode == 0:
                classified = None

        logs = result.stdout + result.stderr
        if repairs:
            notes = "\n".join(
                f"[auto-repair] {item['error']['message']} Patch: {item['patch'] or 'nenhum'} ({'aplicado' if item['applied'] else 'nao aplicado'})"
                for item in repairs
            )
            logs = f"{notes}\n{logs}"

        if result.returncode != 0:
            # Matches _node's unconditional treatment: any compile that never
            # passes is reported as the bounded recovery policy being exhausted,
            # whether or not a repair was classified/applicable along the way.
            report = BuildValidationReport(
                installed="failed",
                built="skipped_after_failure",
                ok=False,
                skipped_reason="Build skipped after two automatic recovery attempts.",
                logs_tail=self._tail(logs),
                recovery_status="SKIPPED_AFTER_FAILURE",
            )
            attached = self._attach_audit(report, commands, repairs, classified, None, None)
            attached.manual_fix_guide = self._manual_fix_guide(root, commands, repairs, classified, logs, ecosystem="maven")
            return attached

        report = BuildValidationReport(installed="passed", built="passed", ok=True, logs_tail=self._tail(logs))
        return self._attach_audit(report, commands, repairs, None, None, None)

    def _maven_failed_module_poms(self, root: Path, logs: str) -> list[Path]:
        """Walk up from each javac-reported .java file to the nearest pom.xml -
        that's the reactor module actually failing, regardless of build order."""
        poms: dict[Path, None] = {}
        for match in _JAVA_ERROR_FILE_RE.finditer(logs):
            current = Path(match.group(1)).parent
            for _ in range(12):
                if not current.exists() or current == current.parent:
                    break
                candidate = current / "pom.xml"
                if candidate.is_file():
                    poms[candidate] = None
                    break
                current = current.parent
        return list(poms.keys())

    def _repair_maven_error(
        self, root: Path, classified: ClassifiedBuildError, logs: str, sink: EventSink | None,
        *, simplified: bool = False,
    ) -> tuple[str | None, bool, str]:
        """Resolve each missing Java import to a known Maven coordinate and add it
        to the pom.xml of the module that actually failed to compile."""
        if classified.code != "maven_dependency_not_found" or not classified.package:
            return None, False, "Erro sem correcao deterministica segura."
        packages = [p.strip() for p in classified.package.split(",") if p.strip()]
        pom_paths = self._maven_failed_module_poms(root, logs)
        if not pom_paths:
            return None, False, "Nao foi possivel identificar o modulo Maven que falhou."

        resolved: dict[tuple[str, str], str | None] = {}
        unresolved: list[str] = []
        for package in packages:
            coord = resolve_java_import(package)
            if coord is None:
                unresolved.append(package)
                continue
            group_id, artifact_id, needs_version = coord
            version: str | None = None
            if needs_version:
                if simplified:
                    continue
                version = self._maven_registry_latest(group_id, artifact_id)
                if version is None:
                    unresolved.append(package)
                    continue
            resolved[(group_id, artifact_id)] = version

        if not resolved:
            detail = (
                f"Pacote(s) sem mapeamento conhecido para uma coordenada Maven: {', '.join(unresolved)}."
                if unresolved else "Modo simplificado nao adiciona dependencias com versao explicita."
            )
            return None, False, detail

        added_labels: list[str] = []
        for pom_path in pom_paths:
            for (group_id, artifact_id), version in resolved.items():
                if self._add_maven_dependency(pom_path, group_id, artifact_id, version):
                    added_labels.append(f"{group_id}:{artifact_id}" + (f":{version}" if version else ""))
        if not added_labels:
            return None, False, "Dependencias resolvidas ja estavam declaradas nos pom.xml afetados."

        modules = ", ".join(sorted({p.parent.name for p in pom_paths}))
        detail = f"Sem mapeamento conhecido (nao corrigido): {', '.join(unresolved)}." if unresolved else ""
        return (
            f"Dependencia(s) Maven adicionada(s) em {modules}: {', '.join(sorted(set(added_labels)))}.",
            True,
            detail,
        )

    def _add_maven_dependency(self, pom_path: Path, group_id: str, artifact_id: str, version: str | None) -> bool:
        try:
            text = pom_path.read_text(encoding="utf-8")
        except OSError:
            return False
        if f"<artifactId>{artifact_id}</artifactId>" in text:
            return False
        closing_tag = re.search(r"[ \t]*</dependencies>", text)
        if closing_tag is None:
            return False
        indent = closing_tag.group(0)[: -len("</dependencies>")] or "    "
        version_xml = f"\n{indent}    <version>{version}</version>" if version else ""
        dep_xml = (
            f"{indent}<dependency>\n"
            f"{indent}    <groupId>{group_id}</groupId>\n"
            f"{indent}    <artifactId>{artifact_id}</artifactId>{version_xml}\n"
            f"{indent}</dependency>\n"
        )
        idx = closing_tag.start()
        pom_path.write_text(text[:idx] + dep_xml + text[idx:], encoding="utf-8")
        return True

    def _maven_registry_latest(self, group_id: str, artifact_id: str) -> str | None:
        try:
            lookup = dependency_research_service.latest_maven(group_id, artifact_id)
        except Exception:  # noqa: BLE001 — registry probe is best-effort
            return None
        return lookup.latest_version

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
        records: list[dict[str, Any]] | None = None,
        record_phase: str | None = None,
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
            proc = popen(full, cwd=cwd, text=True, encoding="utf-8", errors="replace", stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1)
        except FileNotFoundError:
            message = f"Executavel '{exe}' nao encontrado no PATH do servidor."
            self._emit(sink, {"type": "command_skipped", "level": "warning", "command": display,
                              "cwd": cwd, "message": message, "exitCode": 127})
            if records is not None:
                records.append({"phase": record_phase or phase, "command": display, "cwd": cwd,
                                "exit_code": 127, "duration_ms": 0, "stdout_tail": "", "stderr_tail": message,
                                "stdout": "", "stderr": message})
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

        if records is not None:
            records.append({"phase": record_phase or phase, "command": display, "cwd": cwd,
                            "exit_code": None if timed_out else proc.returncode, "duration_ms": elapsed_ms,
                            "stdout_tail": self._tail(stdout, 40), "stderr_tail": self._tail(stderr, 40),
                            "stdout": self._redact(stdout), "stderr": self._redact(stderr)})

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
