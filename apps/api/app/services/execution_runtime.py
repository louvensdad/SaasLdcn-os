from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Any, Callable, Sequence
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from app.core.config import Settings, get_settings


class ExecutionStatus(StrEnum):
    QUEUED = "QUEUED"
    PREPARING_SANDBOX = "PREPARING_SANDBOX"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"
    RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED"
    SECURITY_BLOCKED = "SECURITY_BLOCKED"
    CANCELLED = "CANCELLED"
    SANDBOX_ERROR = "SANDBOX_ERROR"


class NetworkPolicy(StrEnum):
    NONE = "none"
    PACKAGE_REGISTRY = "package_registry"
    GIT = "git"


@dataclass(frozen=True)
class RuntimeLimits:
    timeout_seconds: int = 300
    memory_mb: int = 2048
    cpu_cores: float = 1.0
    disk_mb: int = 1024
    pids: int = 128
    output_bytes: int = 2 * 1024 * 1024
    generated_file_bytes: int = 256 * 1024 * 1024
    open_files: int = 1024


@dataclass(frozen=True)
class ExecutionRequest:
    command: tuple[str, ...]
    project_id: str
    workspace_id: str = ""
    job_id: str = ""
    cwd: str = "."
    network: NetworkPolicy = NetworkPolicy.NONE
    limits: RuntimeLimits = field(default_factory=RuntimeLimits)
    source: str = "system"
    environment: dict[str, str] = field(default_factory=dict)


@dataclass
class ExecutionResult:
    execution_id: str
    sandbox_id: str
    status: ExecutionStatus
    command: str
    cwd: str
    image: str
    started_at: str
    finished_at: str
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    failure_reason: str = ""
    files_changed: list[str] = field(default_factory=list)
    resources: dict[str, int | float | str] = field(default_factory=dict)


LineSink = Callable[[str, str], None]
_SECRET_RE = re.compile(r"(?i)(secret|token|password|api[_-]?key|private[_-]?key|credential)(\s*[=:]\s*)\S+")
_URL_CREDENTIAL_RE = re.compile(r"(?P<scheme>https?://)(?P<userinfo>[^/@\s]+)@", re.IGNORECASE)
_SAFE_ENV_NAMES = {"CI", "NODE_ENV", "PYTHONUNBUFFERED", "MAVEN_OPTS", "GRADLE_OPTS"}
_ALLOWED_PROGRAMS = {
    "npm", "npx", "node", "python", "python3", "pip", "pip3", "pytest", "mvn", "mvnw",
    "gradle", "gradlew", "java", "git", "go", "cargo", "composer", "php", "dotnet",
}
_BLOCKED_PROGRAMS = {
    "docker", "podman", "kubectl", "bash", "sh", "zsh", "cmd", "powershell", "pwsh", "sudo",
    "su", "ssh", "scp", "curl", "wget",
}


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def redact(text: str, secrets: Sequence[str] = ()) -> str:
    sanitized = _SECRET_RE.sub(r"\1\2[redacted]", text)
    sanitized = _URL_CREDENTIAL_RE.sub(r"\g<scheme>[redacted]@", sanitized)
    for secret in sorted((value for value in secrets if len(value) >= 4), key=len, reverse=True):
        sanitized = sanitized.replace(secret, "[redacted]")
    return sanitized


def sanitized_command(command: Sequence[str]) -> str:
    safe: list[str] = []
    for raw in command:
        value = str(raw)
        try:
            parsed = urlsplit(value)
            if parsed.scheme in {"http", "https"} and parsed.username:
                host = parsed.hostname or ""
                if parsed.port:
                    host = f"{host}:{parsed.port}"
                value = urlunsplit((parsed.scheme, f"[redacted]@{host}", parsed.path, parsed.query, parsed.fragment))
        except ValueError:
            pass
        safe.append(value)
    return subprocess.list2cmdline(safe)


class ExecutionRuntime(ABC):
    @abstractmethod
    def open_session(self, workspace: Path, *, project_id: str, workspace_id: str = "", job_id: str = "") -> str:
        raise NotImplementedError

    @abstractmethod
    def execute(self, sandbox_id: str, request: ExecutionRequest, *, on_line: LineSink | None = None) -> ExecutionResult:
        raise NotImplementedError

    @abstractmethod
    def sync_workspace(self, sandbox_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def export_workspace(self, sandbox_id: str, destination: Path) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def close_session(self, sandbox_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def cancel(self, sandbox_id: str) -> bool:
        raise NotImplementedError


@dataclass
class _Session:
    sandbox_id: str
    container_name: str
    snapshot: Path
    source: Path
    project_id: str
    workspace_id: str
    job_id: str
    network_name: str = ""
    lock: threading.Lock = field(default_factory=threading.Lock)
    cancelled: threading.Event = field(default_factory=threading.Event)


class SandboxExecutionRuntime(ExecutionRuntime):
    """Runs untrusted argv in an ephemeral, resource-limited Docker container.

    This is the only module allowed to create host processes. Those processes are
    fixed Docker control-plane calls; project argv is forwarded without a shell.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.image = self.settings.sandbox_image
        self.evidence_root = self.settings.sandbox_evidence_root.resolve()
        self.evidence_root.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.RLock()

    def open_session(self, workspace: Path, *, project_id: str, workspace_id: str = "", job_id: str = "") -> str:
        source = workspace.resolve()
        if not source.is_dir():
            raise ValueError("Sandbox workspace does not exist.")
        docker = self._docker_binary()
        sandbox_id = f"sbx_{uuid4().hex[:16]}"
        container = f"ldcn-{sandbox_id}"
        snapshot = Path(tempfile.mkdtemp(prefix=f"ldcn-{sandbox_id}-"))
        self._copy_workspace(source, snapshot)
        limits = self.default_limits()
        owner = self.settings.sandbox_user.split(":", 1)
        if len(owner) != 2 or not all(value.isdigit() for value in owner):
            shutil.rmtree(snapshot, ignore_errors=True)
            raise RuntimeError("LDCN_SANDBOX_USER must use a numeric uid:gid pair.")
        workspace_owner = f"uid={owner[0]},gid={owner[1]}"
        command = [
            docker, "run", "-d", "--name", container, "--hostname", "ldcn-sandbox", "--network", "none",
            "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--pids-limit", str(limits.pids), "--memory", f"{limits.memory_mb}m",
            "--memory-swap", f"{limits.memory_mb}m", "--cpus", str(limits.cpu_cores),
            "--ulimit", f"nofile={limits.open_files}:{limits.open_files}",
            "--tmpfs", f"/workspace:rw,nosuid,nodev,{workspace_owner},mode=0755,size={limits.disk_mb}m",
            "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=128m", "--label", "ldcn.runtime=sandbox",
            "--label", f"ldcn.project={self._label(project_id)}", self.image, "sleep", "infinity",
        ]
        created = self._control(command, timeout=60)
        if created.returncode != 0:
            shutil.rmtree(snapshot, ignore_errors=True)
            raise RuntimeError(redact(created.stderr or created.stdout))
        try:
            copied = self._stream_workspace(snapshot, container)
            if copied.returncode != 0:
                raise RuntimeError(redact(copied.stderr or copied.stdout))
        except Exception:
            self._control([docker, "rm", "-f", container], timeout=30)
            shutil.rmtree(snapshot, ignore_errors=True)
            raise
        with self._lock:
            self._sessions[sandbox_id] = _Session(sandbox_id, container, snapshot, source, project_id, workspace_id, job_id)
        try:
            from app.services.presence_event_service import owner_for_job, sandbox_lifecycle
            sandbox_lifecycle(user_id=owner_for_job(job_id), workspace_id=workspace_id, project_id=project_id, action="sandbox_prepared", correlation_id=sandbox_id)
        except Exception:
            pass
        return sandbox_id

    def execute(self, sandbox_id: str, request: ExecutionRequest, *, on_line: LineSink | None = None) -> ExecutionResult:
        session = self._session(sandbox_id)
        execution_id = f"exec_{uuid4().hex[:16]}"
        started_at = _now()
        started = time.monotonic()
        try:
            from app.services.presence_event_service import owner_for_job, sandbox_lifecycle
            sandbox_lifecycle(user_id=owner_for_job(request.job_id), workspace_id=request.workspace_id, project_id=request.project_id, action="execution_started", correlation_id=execution_id, severity="INFO")
        except Exception:
            pass
        display = sanitized_command(request.command)
        blocked = self._validate_request(request)
        if blocked:
            return self._finish(session, request, execution_id, ExecutionStatus.SECURITY_BLOCKED, started_at, started, display, reason=blocked)
        with session.lock:
            if session.cancelled.is_set():
                return self._finish(session, request, execution_id, ExecutionStatus.CANCELLED, started_at, started, display, reason="Sandbox execution was cancelled.")
            network_error = self._configure_network(session, request.network)
            if network_error:
                return self._finish(session, request, execution_id, ExecutionStatus.SECURITY_BLOCKED, started_at, started, display, reason=network_error)
            cwd = self._safe_cwd(request.cwd)
            secrets = tuple(request.environment.values())
            docker = self._docker_binary()
            argv = [docker, "exec", "--user", self.settings.sandbox_user, "--workdir", f"/workspace/{cwd}", "--env", "HOME=/tmp", "--env", "CI=1"]
            for key, value in request.environment.items():
                if key in _SAFE_ENV_NAMES:
                    argv.extend(["--env", f"{key}={value}"])
            if request.network != NetworkPolicy.NONE:
                argv.extend(["--env", f"HTTPS_PROXY={self.settings.sandbox_egress_proxy}", "--env", f"HTTP_PROXY={self.settings.sandbox_egress_proxy}", "--env", "NO_PROXY="])
            argv.extend([session.container_name, *request.command])
            try:
                return self._run_attached(
                    session, request, execution_id, argv, display, started_at, started, secrets, on_line
                )
            finally:
                if request.network != NetworkPolicy.NONE:
                    self._disconnect_network(session)

    def sync_workspace(self, sandbox_id: str) -> None:
        session = self._session(sandbox_id)
        refresh = Path(tempfile.mkdtemp(prefix=f"ldcn-sync-{sandbox_id}-"))
        try:
            self._copy_workspace(session.source, refresh)
            copied = self._stream_workspace(refresh, session.container_name)
            if copied.returncode != 0:
                raise RuntimeError(redact(copied.stderr or copied.stdout))
        finally:
            shutil.rmtree(refresh, ignore_errors=True)
    def export_workspace(self, sandbox_id: str, destination: Path) -> list[str]:
        session = self._session(sandbox_id)
        export_root = Path(tempfile.mkdtemp(prefix=f"ldcn-export-{sandbox_id}-"))
        try:
            copied = self._control(
                [self._docker_binary(), "cp", f"{session.container_name}:/workspace/.", str(export_root)],
                timeout=120,
            )
            if copied.returncode != 0:
                raise RuntimeError(redact(copied.stderr or copied.stdout))
            total = 0
            changed: list[str] = []
            for path in export_root.rglob("*"):
                if path.is_symlink():
                    raise RuntimeError("Sandbox export contains a forbidden symbolic link.")
                if not path.is_file():
                    continue
                size = path.stat().st_size
                if size > self.settings.sandbox_generated_file_bytes:
                    raise RuntimeError("Sandbox export contains a file above the generated-file limit.")
                total += size
                if total > self.settings.sandbox_disk_mb * 1024 * 1024:
                    raise RuntimeError("Sandbox export exceeds the disk limit.")
                changed.append(path.relative_to(export_root).as_posix())
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copytree(export_root, destination, dirs_exist_ok=True, symlinks=False)
            return changed
        finally:
            shutil.rmtree(export_root, ignore_errors=True)
    def close_session(self, sandbox_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(sandbox_id, None)
        if session:
            docker = self._docker_binary()
            self._control([docker, "rm", "-f", session.container_name], timeout=30)
            if session.network_name:
                self._control(
                    [docker, "network", "disconnect", session.network_name, self.settings.sandbox_egress_proxy_container],
                    timeout=15,
                )
                self._control([docker, "network", "rm", session.network_name], timeout=15)
            shutil.rmtree(session.snapshot, ignore_errors=True)

    def cancel(self, sandbox_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(sandbox_id)
        if not session:
            return False
        session.cancelled.set()
        self._control([self._docker_binary(), "kill", session.container_name], timeout=15)
        return True

    def _run_attached(self, session: _Session, request: ExecutionRequest, execution_id: str, argv: list[str], display: str, started_at: str, started: float, secrets: Sequence[str], on_line: LineSink | None) -> ExecutionResult:
        out: list[str] = []
        err: list[str] = []
        total_bytes = 0
        output_exceeded = threading.Event()
        try:
            proc = subprocess.Popen(argv, text=True, encoding="utf-8", errors="replace", shell=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1, env=self._docker_env())
        except OSError as exc:
            return self._finish(session, request, execution_id, ExecutionStatus.SANDBOX_ERROR, started_at, started, display, reason=redact(str(exc), secrets))
        byte_lock = threading.Lock()

        def pump(pipe: object, bucket: list[str], stream: str) -> None:
            nonlocal total_bytes
            try:
                for line in iter(getattr(pipe, "readline"), ""):
                    clean = redact(line.rstrip("\n"), secrets)
                    with byte_lock:
                        total_bytes += len(clean.encode("utf-8", "replace")) + 1
                        if total_bytes > request.limits.output_bytes:
                            output_exceeded.set()
                            break
                    bucket.append(clean)
                    if on_line:
                        try:
                            on_line(stream, clean)
                        except Exception:
                            pass
            finally:
                try:
                    getattr(pipe, "close")()
                except OSError:
                    pass

        threads = [threading.Thread(target=pump, args=(proc.stdout, out, "stdout"), daemon=True), threading.Thread(target=pump, args=(proc.stderr, err, "stderr"), daemon=True)]
        for thread in threads:
            thread.start()
        sampled: dict[str, int | float] = {
            "peak_memory_bytes": 0, "peak_cpu_percent": 0.0,
            "peak_pids": 0, "network_rx_bytes": 0, "network_tx_bytes": 0,
        }
        sampling_stop = threading.Event()

        def sample_resources() -> None:
            while not sampling_stop.is_set():
                stats = self._control(
                    [
                        self._docker_binary(), "stats", "--no-stream", "--format", "{{json .}}",
                        session.container_name,
                    ],
                    timeout=5,
                )
                if stats.returncode == 0 and stats.stdout.strip():
                    try:
                        payload = json.loads(stats.stdout.strip().splitlines()[-1])
                        sampled["peak_cpu_percent"] = max(
                            float(sampled["peak_cpu_percent"]),
                            float(str(payload.get("CPUPerc", "0")).strip().rstrip("%") or 0),
                        )
                        memory = self._parse_size(str(payload.get("MemUsage", "0")).split("/", 1)[0])
                        sampled["peak_memory_bytes"] = max(int(sampled["peak_memory_bytes"]), memory)
                        sampled["peak_pids"] = max(int(sampled["peak_pids"]), int(payload.get("PIDs") or 0))
                        network = str(payload.get("NetIO", "0 / 0")).split("/", 1)
                        sampled["network_rx_bytes"] = max(int(sampled["network_rx_bytes"]), self._parse_size(network[0]))
                        if len(network) > 1:
                            sampled["network_tx_bytes"] = max(int(sampled["network_tx_bytes"]), self._parse_size(network[1]))
                    except (TypeError, ValueError, json.JSONDecodeError):
                        pass
                sampling_stop.wait(0.25)

        sampler_thread = threading.Thread(target=sample_resources, daemon=True)
        sampler_thread.start()

        status = ExecutionStatus.RUNNING
        deadline = started + request.limits.timeout_seconds
        while proc.poll() is None:
            if session.cancelled.is_set():
                status = ExecutionStatus.CANCELLED
                self.cancel(session.sandbox_id)
                break
            if output_exceeded.is_set():
                status = ExecutionStatus.RESOURCE_LIMIT_EXCEEDED
                self.cancel(session.sandbox_id)
                break
            if time.monotonic() >= deadline:
                status = ExecutionStatus.TIMED_OUT
                self.cancel(session.sandbox_id)
                break
            time.sleep(0.05)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        sampling_stop.set()
        sampler_thread.join(timeout=6)
        for thread in threads:
            thread.join(timeout=2)
        if status == ExecutionStatus.RUNNING:
            status = ExecutionStatus.SUCCEEDED if proc.returncode == 0 else ExecutionStatus.FAILED
            if status == ExecutionStatus.FAILED and self._oom_killed(session):
                status = ExecutionStatus.RESOURCE_LIMIT_EXCEEDED
        reasons = {
            ExecutionStatus.TIMED_OUT: f"Execution exceeded {request.limits.timeout_seconds}s.",
            ExecutionStatus.RESOURCE_LIMIT_EXCEEDED: f"Output exceeded {request.limits.output_bytes} bytes.",
            ExecutionStatus.CANCELLED: "Execution was cancelled.",
        }
        return self._finish(session, request, execution_id, status, started_at, started, display, exit_code=proc.returncode, stdout="\n".join(out), stderr="\n".join(err), reason=reasons.get(status, ""), resources={"stdout_stderr_bytes": min(total_bytes, request.limits.output_bytes), **sampled})

    def _finish(self, session: _Session, request: ExecutionRequest, execution_id: str, status: ExecutionStatus, started_at: str, started: float, command: str, *, exit_code: int | None = None, stdout: str = "", stderr: str = "", reason: str = "", resources: dict[str, int | float | str] | None = None) -> ExecutionResult:
        result = ExecutionResult(
            execution_id=execution_id, sandbox_id=session.sandbox_id, status=status, command=command,
            cwd=request.cwd or ".", image=self.image, started_at=started_at, finished_at=_now(), exit_code=exit_code,
            stdout=redact(stdout), stderr=redact(stderr), duration_ms=int((time.monotonic() - started) * 1000),
            failure_reason=redact(reason), files_changed=[], resources={
                "memory_limit_mb": request.limits.memory_mb, "cpu_limit_cores": request.limits.cpu_cores,
                "disk_limit_mb": request.limits.disk_mb, "pids_limit": request.limits.pids,
                "open_files_limit": request.limits.open_files, **(resources or {}),
            },
        )
        if result.status not in {
            ExecutionStatus.CANCELLED, ExecutionStatus.TIMED_OUT,
            ExecutionStatus.RESOURCE_LIMIT_EXCEEDED, ExecutionStatus.SANDBOX_ERROR,
        }:
            try:
                result.files_changed = self._inspect_workspace(session, request.limits)
                result.resources["workspace_bytes"] = sum(
                    path.stat().st_size for path in session.snapshot.rglob("*") if path.is_file()
                )
                result.resources["files_changed_count"] = len(result.files_changed)
            except RuntimeError as exc:
                result.status = ExecutionStatus.RESOURCE_LIMIT_EXCEEDED
                result.failure_reason = redact(str(exc))
                result.exit_code = result.exit_code if result.exit_code not in {0, None} else 125
        self._persist(session, request, result)
        try:
            from app.services.presence_event_service import owner_for_job, sandbox_result
            sandbox_result(user_id=owner_for_job(session.job_id), workspace_id=session.workspace_id, project_id=session.project_id, execution_id=result.execution_id, status=result.status.value, reason=result.failure_reason)
        except Exception:
            pass
        return result

    def _persist(self, session: _Session, request: ExecutionRequest, result: ExecutionResult) -> None:
        from app.core.metrics import SANDBOX_EXECUTIONS

        SANDBOX_EXECUTIONS.labels(status=result.status.value, source=request.source).inc()
        record = asdict(result)
        record.update({"jobId": request.job_id or session.job_id, "projectId": request.project_id or session.project_id, "workspaceId": request.workspace_id or session.workspace_id, "timeoutSeconds": request.limits.timeout_seconds, "networkPolicy": request.network.value, "source": request.source})
        record["status"] = result.status.value
        target = self.evidence_root / f"{result.execution_id}.json"
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(target)

    @staticmethod
    def _parse_size(value: str) -> int:
        match = re.match(r"\s*([0-9.]+)\s*([kmgt]?i?b)?", value, re.IGNORECASE)
        if not match:
            return 0
        number = float(match.group(1))
        unit = (match.group(2) or "b").lower()
        factors = {
            "b": 1, "kb": 1000, "kib": 1024, "mb": 1000**2, "mib": 1024**2,
            "gb": 1000**3, "gib": 1024**3, "tb": 1000**4, "tib": 1024**4,
        }
        return int(number * factors.get(unit, 1))
    def _inspect_workspace(self, session: _Session, limits: RuntimeLimits) -> list[str]:
        export_root = Path(tempfile.mkdtemp(prefix=f"ldcn-inspect-{session.sandbox_id}-"))
        try:
            copied = self._control(
                [self._docker_binary(), "cp", f"{session.container_name}:/workspace/.", str(export_root)],
                timeout=120,
            )
            if copied.returncode != 0:
                raise RuntimeError(redact(copied.stderr or copied.stdout))
            before = self._file_fingerprints(session.snapshot, limits)
            after = self._file_fingerprints(export_root, limits)
            changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
            shutil.rmtree(session.snapshot, ignore_errors=True)
            shutil.move(str(export_root), str(session.snapshot))
            return changed
        finally:
            shutil.rmtree(export_root, ignore_errors=True)

    @staticmethod
    def _file_fingerprints(root: Path, limits: RuntimeLimits) -> dict[str, tuple[int, str]]:
        import hashlib

        fingerprints: dict[str, tuple[int, str]] = {}
        total = 0
        for path in root.rglob("*"):
            if path.is_symlink():
                raise RuntimeError("Sandbox workspace contains a forbidden symbolic link.")
            if not path.is_file():
                continue
            size = path.stat().st_size
            if size > limits.generated_file_bytes:
                raise RuntimeError("Sandbox generated a file above the configured limit.")
            total += size
            if total > limits.disk_mb * 1024 * 1024:
                raise RuntimeError("Sandbox workspace exceeds the configured disk limit.")
            fingerprints[path.relative_to(root).as_posix()] = (size, hashlib.sha256(path.read_bytes()).hexdigest())
        return fingerprints

    def _oom_killed(self, session: _Session) -> bool:
        inspected = self._control(
            [self._docker_binary(), "inspect", session.container_name, "--format", "{{.State.OOMKilled}}"],
            timeout=15,
        )
        return inspected.returncode == 0 and inspected.stdout.strip().lower() == "true"
    def _configure_network(self, session: _Session, policy: NetworkPolicy) -> str:
        if policy == NetworkPolicy.NONE:
            return ""
        if not self.settings.sandbox_egress_proxy or not self.settings.sandbox_egress_network:
            return "Network access requires the approved sandbox egress proxy and internal Docker network."
        docker = self._docker_binary()
        inspected = self._control(
            [docker, "network", "inspect", self.settings.sandbox_egress_network, "--format", "{{.Internal}}"],
            timeout=15,
        )
        if inspected.returncode != 0 or inspected.stdout.strip().lower() != "true":
            return "The configured sandbox egress network is missing or is not internal."
        if not session.network_name:
            session.network_name = f"ldcn-net-{session.sandbox_id}"
            created = self._control(
                [docker, "network", "create", "--internal", "--label", "ldcn.runtime=sandbox", session.network_name],
                timeout=20,
            )
            if created.returncode != 0:
                session.network_name = ""
                return "Could not create the per-sandbox internal network."
            proxy = self._control(
                [
                    docker, "network", "connect", "--alias", "egress-proxy", session.network_name,
                    self.settings.sandbox_egress_proxy_container,
                ],
                timeout=20,
            )
            if proxy.returncode != 0:
                self._control([docker, "network", "rm", session.network_name], timeout=15)
                session.network_name = ""
                return "Could not attach the approved egress proxy to the sandbox network."
        self._control([docker, "network", "disconnect", "none", session.container_name], timeout=15)
        connected = self._control(
            [docker, "network", "connect", session.network_name, session.container_name],
            timeout=15,
        )
        if connected.returncode != 0 and "already exists" not in connected.stderr.lower():
            return "Could not attach the sandbox to its isolated egress network."
        return ""

    def _disconnect_network(self, session: _Session) -> None:
        if session.network_name:
            self._control(
                [self._docker_binary(), "network", "disconnect", session.network_name, session.container_name],
                timeout=15,
            )
    def _validate_request(self, request: ExecutionRequest) -> str:
        if not request.command:
            return "Empty command."
        program = Path(request.command[0]).name.lower()
        if program.endswith((".cmd", ".exe", ".bat")):
            program = Path(program).stem
        if program in _BLOCKED_PROGRAMS:
            return f"Program '{program}' is forbidden inside the sandbox."
        if program not in _ALLOWED_PROGRAMS and not program.startswith(("mvnw", "gradlew")):
            return f"Program '{program}' is not in the execution policy."
        if any("\x00" in part for part in request.command):
            return "NUL bytes are forbidden in command arguments."
        try:
            self._safe_cwd(request.cwd)
        except ValueError as exc:
            return str(exc)
        return ""

    @staticmethod
    def _safe_cwd(cwd: str) -> str:
        normalized = (cwd or ".").replace("\\", "/").strip("/") or "."
        if Path(normalized).is_absolute() or ".." in Path(normalized).parts:
            raise ValueError("Working directory must stay inside the sandbox workspace.")
        return normalized

    def default_limits(self, timeout_seconds: int | None = None) -> RuntimeLimits:
        return RuntimeLimits(
            timeout_seconds=timeout_seconds or self.settings.sandbox_timeout_seconds,
            memory_mb=self.settings.sandbox_memory_mb, cpu_cores=self.settings.sandbox_cpu_cores,
            disk_mb=self.settings.sandbox_disk_mb, pids=self.settings.sandbox_pids,
            output_bytes=self.settings.sandbox_output_bytes, generated_file_bytes=self.settings.sandbox_generated_file_bytes,
            open_files=self.settings.sandbox_open_files,
        )

    def _docker_binary(self) -> str:
        binary = shutil.which(self.settings.sandbox_container_cli)
        if not binary:
            raise RuntimeError("Sandbox container runtime is unavailable; host execution remains disabled.")
        return binary

    def _stream_workspace(self, source: Path, container: str) -> subprocess.CompletedProcess[str]:
        archive_fd, archive_name = tempfile.mkstemp(prefix="ldcn-workspace-", suffix=".tar")
        os.close(archive_fd)
        archive_path = Path(archive_name)
        try:
            with tarfile.open(archive_path, "w") as archive:
                archive.add(source, arcname=".", recursive=True)
            command = [
                self._docker_binary(), "exec", "-i", "--user", self.settings.sandbox_user, container,
                "tar", "--no-same-owner", "-xf", "-", "-C", "/workspace",
            ]
            try:
                with archive_path.open("rb") as archive:
                    completed = subprocess.run(
                        command, stdin=archive, capture_output=True, timeout=120, shell=False,
                        env=self._docker_env(),
                    )
                return subprocess.CompletedProcess(
                    command, completed.returncode,
                    completed.stdout.decode("utf-8", errors="replace"),
                    completed.stderr.decode("utf-8", errors="replace"),
                )
            except (OSError, subprocess.TimeoutExpired) as exc:
                return subprocess.CompletedProcess(command, 125, "", str(exc))
        finally:
            archive_path.unlink(missing_ok=True)
    @staticmethod
    def _control(command: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, shell=False, env=SandboxExecutionRuntime._docker_env())
        except (OSError, subprocess.TimeoutExpired) as exc:
            return subprocess.CompletedProcess(command, 125, "", str(exc))

    @staticmethod
    def _docker_env() -> dict[str, str]:
        allowed = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "DOCKER_HOST", "DOCKER_CONTEXT", "HOME", "USERPROFILE"}
        return {key: value for key, value in os.environ.items() if key.upper() in allowed}

    def _copy_workspace(self, source: Path, target: Path) -> None:
        ignored_suffixes = {".pem", ".key", ".p12", ".pfx"}
        total = 0
        for path in source.rglob("*"):
            if path.is_symlink():
                raise RuntimeError("Symbolic links are forbidden in sandbox input.")
            if not path.is_file():
                continue
            relative = path.relative_to(source)
            if any(part == ".git" or part.startswith(".env") for part in relative.parts):
                continue
            if path.suffix.lower() in ignored_suffixes:
                continue
            size = path.stat().st_size
            if size > self.settings.sandbox_generated_file_bytes:
                raise RuntimeError("Sandbox input contains a file above the configured limit.")
            total += size
            if total > self.settings.sandbox_disk_mb * 1024 * 1024:
                raise RuntimeError("Sandbox input exceeds the configured disk limit.")
        def ignore(_root: str, names: list[str]) -> set[str]:
            return {
                name for name in names
                if name == ".git" or name.startswith(".env")
                or Path(name).suffix.lower() in ignored_suffixes
            }
        shutil.copytree(source, target, dirs_exist_ok=True, symlinks=False, ignore=ignore)
    def _session(self, sandbox_id: str) -> _Session:
        with self._lock:
            session = self._sessions.get(sandbox_id)
        if not session:
            raise ValueError("Unknown or closed sandbox session.")
        return session

    @staticmethod
    def _label(value: str) -> str:
        return re.sub(r"[^A-Za-z0-9_.-]", "_", value)[:63]


class HostExecutionRuntime(ExecutionRuntime):
    """Unsafe development escape hatch.

    It is intentionally impossible to construct in production and emits a strong
    warning. It exists only for explicit local toolchain debugging when Docker is
    unavailable; shared and multi-user deployments must use the sandbox backend.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        import logging

        self.settings = settings or get_settings()
        if self.settings.environment not in {"local", "development", "test"}:
            raise RuntimeError("Host execution is forbidden outside local development.")
        if not self.settings.allow_host_execution or self.settings.execution_runtime != "host":
            raise RuntimeError(
                "Host execution requires EXECUTION_RUNTIME=host and ALLOW_HOST_EXECUTION=true."
            )
        logging.getLogger(__name__).critical(
            "UNSAFE LOCAL DEVELOPMENT MODE: project commands can access the host. "
            "Never enable ALLOW_HOST_EXECUTION in a shared environment."
        )
        self.evidence_root = self.settings.sandbox_evidence_root.resolve()
        self.evidence_root.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, dict[str, object]] = {}
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._background: dict[str, tuple[subprocess.Popen[str], Any, Path]] = {}
        self._lock = threading.RLock()
        self._policy = SandboxExecutionRuntime(self.settings)

    def open_session(
        self, workspace: Path, *, project_id: str, workspace_id: str = "", job_id: str = ""
    ) -> str:
        source = workspace.resolve()
        if not source.is_dir():
            raise ValueError("Host-development workspace does not exist.")
        sandbox_id = f"hostdev_{uuid4().hex[:12]}"
        temp_root = Path(tempfile.mkdtemp(prefix=f"ldcn-{sandbox_id}-"))
        self._policy._copy_workspace(source, temp_root)
        with self._lock:
            self._sessions[sandbox_id] = {
                "source": source, "root": temp_root, "project_id": project_id,
                "workspace_id": workspace_id, "job_id": job_id,
            }
        return sandbox_id

    def execute(
        self, sandbox_id: str, request: ExecutionRequest, *, on_line: LineSink | None = None
    ) -> ExecutionResult:
        session = self._session(sandbox_id)
        execution_id = f"exec_{uuid4().hex[:16]}"
        started_at = _now()
        started = time.monotonic()
        display = sanitized_command(request.command)
        blocked = self._policy._validate_request(request)
        if blocked:
            return self._result(
                session, request, execution_id, sandbox_id, ExecutionStatus.SECURITY_BLOCKED,
                display, started_at, started, reason=blocked,
            )
        root = Path(session["root"])
        cwd = (root / self._policy._safe_cwd(request.cwd)).resolve()
        if cwd != root and root not in cwd.parents:
            return self._result(
                session, request, execution_id, sandbox_id, ExecutionStatus.SECURITY_BLOCKED,
                display, started_at, started, reason="Working directory escaped the development workspace.",
            )
        env_names = {
            "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE",
            "TEMP", "TMP", "LANG", "LC_ALL",
        }
        env = {key: value for key, value in os.environ.items() if key.upper() in env_names}
        env["CI"] = "1"
        try:
            proc = subprocess.Popen(
                list(request.command), cwd=cwd, text=True, encoding="utf-8", errors="replace",
                shell=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
            )
            with self._lock:
                self._processes[sandbox_id] = proc
            try:
                stdout, stderr = proc.communicate(timeout=request.limits.timeout_seconds)
                status = ExecutionStatus.SUCCEEDED if proc.returncode == 0 else ExecutionStatus.FAILED
            except subprocess.TimeoutExpired:
                proc.kill()
                stdout, stderr = proc.communicate()
                status = ExecutionStatus.TIMED_OUT
        except OSError as exc:
            return self._result(
                session, request, execution_id, sandbox_id, ExecutionStatus.SANDBOX_ERROR,
                display, started_at, started, reason=str(exc),
            )
        finally:
            with self._lock:
                self._processes.pop(sandbox_id, None)
        secrets = tuple(request.environment.values())
        stdout = redact(stdout, secrets)
        stderr = redact(stderr, secrets)
        output_size = len(stdout.encode("utf-8", "replace")) + len(stderr.encode("utf-8", "replace"))
        if output_size > request.limits.output_bytes:
            status = ExecutionStatus.RESOURCE_LIMIT_EXCEEDED
            stdout = stdout.encode("utf-8")[: request.limits.output_bytes].decode("utf-8", "ignore")
            stderr = ""
        if on_line:
            for line in stdout.splitlines():
                on_line("stdout", line)
            for line in stderr.splitlines():
                on_line("stderr", line)
        reason = (
            f"Execution exceeded {request.limits.timeout_seconds}s."
            if status == ExecutionStatus.TIMED_OUT else
            "Output exceeded the configured limit."
            if status == ExecutionStatus.RESOURCE_LIMIT_EXCEEDED else ""
        )
        return self._result(
            session, request, execution_id, sandbox_id, status, display, started_at, started,
            exit_code=proc.returncode, stdout=stdout, stderr=stderr, reason=reason,
            resources={"stdout_stderr_bytes": min(output_size, request.limits.output_bytes)},
        )

    def sync_workspace(self, sandbox_id: str) -> None:
        session = self._session(sandbox_id)
        self._policy._copy_workspace(Path(session["source"]), Path(session["root"]))

    def export_workspace(self, sandbox_id: str, destination: Path) -> list[str]:
        session = self._session(sandbox_id)
        root = Path(session["root"])
        files = self._policy._file_fingerprints(root, self.default_limits())
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copytree(root, destination, dirs_exist_ok=True, symlinks=False)
        return sorted(files)

    def close_session(self, sandbox_id: str) -> None:
        self.cancel(sandbox_id)
        with self._lock:
            session = self._sessions.pop(sandbox_id, None)
        if session:
            shutil.rmtree(Path(session["root"]), ignore_errors=True)

    def cancel(self, sandbox_id: str) -> bool:
        with self._lock:
            proc = self._processes.get(sandbox_id)
        if proc is None or proc.poll() is not None:
            return False
        proc.kill()
        return True

    def default_limits(self, timeout_seconds: int | None = None) -> RuntimeLimits:
        return self._policy.default_limits(timeout_seconds)

    def start_background(
        self, sandbox_id: str, command: Sequence[str], *, cwd: str, log_path: Path,
        extra_env: dict[str, str] | None = None,
    ) -> str:
        """Start a long-running process (a dev server) that outlives a single
        execute() call. execute() always blocks until the child exits -- there is
        no equivalent for "start it and come back later" there, and there
        shouldn't be one on SandboxExecutionRuntime either (its workspace lives
        inside an isolated container the host can't listen against directly).
        stdout/stderr go to a real log FILE, never a PIPE nobody drains --
        a PIPE would fill its OS buffer on a chatty dev server and deadlock it."""
        session = self._session(sandbox_id)
        root = Path(session["root"])
        resolved_cwd = (root / self._policy._safe_cwd(cwd)).resolve()  # noqa: SLF001 -- same-module reuse
        if resolved_cwd != root and root not in resolved_cwd.parents:
            raise ValueError("Working directory escaped the development workspace.")
        env_names = {
            "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE",
            "TEMP", "TMP", "LANG", "LC_ALL",
        }
        env = {key: value for key, value in os.environ.items() if key.upper() in env_names}
        env["CI"] = "1"
        env.update(extra_env or {})
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("w", encoding="utf-8", errors="replace")
        proc = subprocess.Popen(
            list(command), cwd=resolved_cwd, env=env, text=True, encoding="utf-8", errors="replace",
            shell=False, stdout=log_file, stderr=subprocess.STDOUT,
        )
        handle_id = f"bg_{uuid4().hex[:12]}"
        with self._lock:
            self._background[handle_id] = (proc, log_file, log_path)
        return handle_id

    def stop_background(self, handle_id: str) -> None:
        with self._lock:
            entry = self._background.pop(handle_id, None)
        if entry is None:
            return
        proc, log_file, _ = entry
        try:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
        finally:
            log_file.close()

    def tail_background(self, handle_id: str, *, max_chars: int = 4000) -> str:
        with self._lock:
            entry = self._background.get(handle_id)
        if entry is None:
            return ""
        try:
            text = entry[2].read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return redact(text[-max_chars:])

    def _session(self, sandbox_id: str) -> dict[str, object]:
        with self._lock:
            session = self._sessions.get(sandbox_id)
        if session is None:
            raise ValueError("Unknown or closed host-development session.")
        return session

    def _result(
        self, session: dict[str, object], request: ExecutionRequest, execution_id: str,
        sandbox_id: str, status: ExecutionStatus, command: str, started_at: str,
        started: float, *, exit_code: int | None = None, stdout: str = "", stderr: str = "",
        reason: str = "", resources: dict[str, int | float | str] | None = None,
    ) -> ExecutionResult:
        result = ExecutionResult(
            execution_id=execution_id, sandbox_id=sandbox_id, status=status, command=command,
            cwd=request.cwd, image="host-development-unsafe", started_at=started_at,
            finished_at=_now(), exit_code=exit_code, stdout=redact(stdout), stderr=redact(stderr),
            duration_ms=int((time.monotonic() - started) * 1000), failure_reason=redact(reason),
            resources=resources or {},
        )
        record = asdict(result)
        record.update({
            "jobId": request.job_id or session["job_id"],
            "projectId": request.project_id or session["project_id"],
            "workspaceId": request.workspace_id or session["workspace_id"],
            "timeoutSeconds": request.limits.timeout_seconds,
            "networkPolicy": request.network.value, "source": request.source,
            "unsafeHostDevelopment": True,
        })
        record["status"] = result.status.value
        target = self.evidence_root / f"{execution_id}.json"
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return result

def create_execution_runtime(settings: Settings | None = None) -> ExecutionRuntime:
    current = settings or get_settings()
    if current.execution_runtime == "sandbox":
        return SandboxExecutionRuntime(current)
    if current.execution_runtime == "host":
        return HostExecutionRuntime(current)
    raise RuntimeError(f"Unsupported EXECUTION_RUNTIME '{current.execution_runtime}'.")


execution_runtime = create_execution_runtime()
