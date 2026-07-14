from __future__ import annotations

import json
import re
import shlex
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from app.schemas.execution_terminal import TerminalCommandRecord
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

# LDCN Execution Terminal: real, controlled command execution INSIDE a generated
# project's workspace. It exists so a failed build never leaves the user without
# a human intervention path — the AI auto-repair is bounded (2 attempts) and when
# it gives up, this terminal is the escape hatch.
#
# Security model (honest scope — this is command control, not a container):
# - the working directory is CONFINED to the generated project root (any cwd or
#   node-script path that resolves outside it is rejected);
# - only allowlisted programs/subcommands run (npm / git read-only / node script);
# - no shell: the command is tokenized and executed with shell=False, and shell
#   metacharacters (| & ; > < ` $ \n) are rejected outright;
# - output is sanitized (secret redaction) before persisting/streaming;
# - every execution lands in a durable per-project history (the audit trail).

LineSink = Callable[[str, str], None]  # (stream, line)

_SECRET_RE = re.compile(
    r"(?i)(secret|token|password|api[_-]?key|private[_-]?key|credential)(\s*[=:]\s*)\S+"
)
_SHELL_META_RE = re.compile(r"[|&;<>`$\r\n]")

# Program -> allowed first argument (None entry = bare program allowed).
# npm run <any-script> is allowed by design: project scripts are the whole point.
ALLOWED_COMMANDS: dict[str, set[str | None]] = {
    "npm": {"install", "ci", "run", "test", "exec", "ls", "audit", "view", "outdated", "--version", "-v"},
    "git": {"status", "log", "diff", "branch", "show", "remote", "--version"},
    "node": set(),  # validated separately: script path must resolve inside the project
    "npx": {"tsc", "eslint", "vitest", "jest", "prettier", "next"},
}

ALLOWED_COMMANDS_DISPLAY = [
    "npm install", "npm run build", "npm run test", "npm run lint", "npm ci",
    "git status", "git log", "git diff", "node <script dentro do projeto>",
    "npx tsc|eslint|vitest|jest|prettier|next",
]

HISTORY_LIMIT = 200
SESSIONS_ROOT = DEFAULT_OUTPUT_ROOT.parent / "terminal-sessions"


class TerminalCommandRejected(ValueError):
    """Raised when a command violates the allowlist / confinement rules."""


class ExecutionTerminalService:
    def __init__(
        self,
        timeout_seconds: int = 300,
        sessions_root: Path | None = None,
        workspace_root: Path | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.sessions_root = (sessions_root or SESSIONS_ROOT).resolve()
        # Terminal sessions are confined UNDER this root (generated projects only).
        self.workspace_root = (workspace_root or DEFAULT_OUTPUT_ROOT).resolve()

    # ----------------------------------------------------------------- public
    def execute(
        self,
        project: dict[str, Any],
        command: str,
        *,
        cwd: str = "",
        executed_by: str | None = None,
        source: str = "user",
        on_line: LineSink | None = None,
    ) -> TerminalCommandRecord:
        """Validate + run one command inside the project workspace, streaming
        sanitized lines through `on_line` and persisting the durable record.
        A rejected command is ALSO recorded (audit trail of attempts)."""
        project_id = str(project["project_id"])
        started_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        record_id = f"term_{uuid4().hex[:12]}"
        try:
            root = self._project_root(project)
            workdir = self._confined_cwd(root, cwd)
            argv = self._validated_argv(root, workdir, command)
        except TerminalCommandRejected as exc:
            record = TerminalCommandRecord(
                id=record_id, project_id=project_id, command=command, cwd=cwd or ".",
                status="rejected", rejection_reason=str(exc), executed_by=executed_by,
                started_at=started_at, source=source,  # type: ignore[arg-type]
            )
            self._persist(project_id, record)
            return record

        exe = shutil.which(argv[0]) or argv[0]
        full = [exe, *argv[1:]]
        start = time.monotonic()
        out_lines: list[str] = []
        err_lines: list[str] = []
        timed_out = False
        try:
            proc = subprocess.Popen(
                full, cwd=str(workdir), text=True, encoding="utf-8", errors="replace", shell=False,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1,
            )
        except (FileNotFoundError, OSError) as exc:
            record = TerminalCommandRecord(
                id=record_id, project_id=project_id, command=command,
                cwd=str(workdir.relative_to(root)) or ".",
                status="rejected", rejection_reason=f"Executavel indisponivel no servidor: {exc}",
                executed_by=executed_by, started_at=started_at, source=source,  # type: ignore[arg-type]
            )
            self._persist(project_id, record)
            return record

        def pump(pipe: Any, bucket: list[str], stream: str) -> None:
            try:
                for line in iter(pipe.readline, ""):
                    text = self._redact(line.rstrip("\n"))
                    bucket.append(text)
                    if on_line is not None:
                        try:
                            on_line(stream, text)
                        except Exception:  # noqa: BLE001 — a broken sink must not kill the command
                            pass
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
        try:
            proc.wait(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            proc.kill()
        finally:
            for thread in pumps:
                thread.join(timeout=2.0)

        record = TerminalCommandRecord(
            id=record_id, project_id=project_id, command=command,
            cwd=(workdir.relative_to(root).as_posix() or "."),
            status="timeout" if timed_out else "completed",
            exit_code=None if timed_out else proc.returncode,
            duration_ms=int((time.monotonic() - start) * 1000),
            stdout_tail=self._tail(out_lines),
            stderr_tail=self._tail(err_lines),
            executed_by=executed_by, started_at=started_at, source=source,  # type: ignore[arg-type]
        )
        self._persist(project_id, record)
        return record

    def history(self, project_id: str) -> list[TerminalCommandRecord]:
        path = self._history_path(project_id)
        if not path.is_file():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return [TerminalCommandRecord.model_validate(item) for item in data if isinstance(item, dict)]

    # --------------------------------------------------------------- security
    def _project_root(self, project: dict[str, Any]) -> Path:
        raw = project.get("generated_project_path")
        if not raw:
            raise TerminalCommandRejected("Projeto sem workspace gerado.")
        root = Path(str(raw)).resolve()
        if not root.is_dir():
            raise TerminalCommandRejected("O workspace do projeto nao existe no servidor.")
        # Isolation: only project directories UNDER the generated-projects root —
        # never the root itself, never anything on the host outside it.
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise TerminalCommandRejected("O terminal so executa dentro do workspace de projetos gerados.")
        return root

    def _confined_cwd(self, root: Path, cwd: str) -> Path:
        candidate = (root / cwd).resolve() if cwd else root
        if candidate != root and root not in candidate.parents:
            raise TerminalCommandRejected(f"Diretorio '{cwd}' fora do projeto; o terminal e isolado por projeto.")
        if not candidate.is_dir():
            raise TerminalCommandRejected(f"Diretorio '{cwd}' nao existe no projeto.")
        return candidate

    def _validated_argv(self, root: Path, workdir: Path, command: str) -> list[str]:
        if _SHELL_META_RE.search(command):
            raise TerminalCommandRejected(
                "Operadores de shell (| & ; > < ` $) nao sao permitidos; execute um comando por vez."
            )
        try:
            argv = shlex.split(command, posix=True)
        except ValueError as exc:
            raise TerminalCommandRejected(f"Comando invalido: {exc}") from exc
        if not argv:
            raise TerminalCommandRejected("Comando vazio.")
        program = argv[0].lower()
        allowed = ALLOWED_COMMANDS.get(program)
        if allowed is None:
            raise TerminalCommandRejected(
                f"'{program}' nao esta na allowlist do terminal. Permitidos: {', '.join(sorted(ALLOWED_COMMANDS))}."
            )
        if program == "node":
            self._validate_node(root, workdir, argv)
        else:
            first = (argv[1] if len(argv) > 1 else None)
            if first is not None and first.lower() not in allowed:
                raise TerminalCommandRejected(
                    f"Subcomando '{first}' de {program} nao permitido. Permitidos: {', '.join(sorted(str(a) for a in allowed))}."
                )
            if first is None and program != "git":
                raise TerminalCommandRejected(f"Informe um subcomando para {program} (ex.: {program} install).")
        return argv

    def _validate_node(self, root: Path, workdir: Path, argv: list[str]) -> None:
        # node runs PROJECT scripts only: no eval flags, and the script path must
        # resolve inside the project root.
        forbidden = {"-e", "--eval", "-p", "--print", "--input-type"}
        if any(arg in forbidden for arg in argv[1:]):
            raise TerminalCommandRejected("node -e/--eval nao e permitido; execute um script do projeto.")
        script = next((arg for arg in argv[1:] if not arg.startswith("-")), None)
        if script is None:
            raise TerminalCommandRejected("Informe o script do projeto a executar (ex.: node scripts/seed.js).")
        target = (workdir / script).resolve()
        if root not in {target, *target.parents} or not target.is_file():
            raise TerminalCommandRejected(f"Script '{script}' nao existe dentro do projeto.")

    # ------------------------------------------------------------ persistence
    def _persist(self, project_id: str, record: TerminalCommandRecord) -> None:
        path = self._history_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        records = [item.model_dump(mode="json") for item in self.history(project_id)]
        records.append(record.model_dump(mode="json"))
        path.write_text(
            json.dumps(records[-HISTORY_LIMIT:], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def _history_path(self, project_id: str) -> Path:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", project_id)
        return self.sessions_root / f"{safe}.json"

    # ----------------------------------------------------------------- helpers
    @staticmethod
    def _redact(line: str) -> str:
        return _SECRET_RE.sub(r"\1\2[redacted]", line)

    def _tail(self, lines: list[str], keep: int = 200) -> str:
        return "\n".join(lines[-keep:])


execution_terminal_service = ExecutionTerminalService()
