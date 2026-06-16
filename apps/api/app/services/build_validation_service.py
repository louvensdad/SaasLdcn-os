from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR, get_settings
from app.schemas.generation_validation import BuildValidationReport


SECRET_LOG_RE = re.compile(
    r"(?i)(secret|token|password|api[_-]?key|private[_-]?key|credential)(\s*[=:]\s*)\S+"
)


class BuildValidationService:
    def __init__(self, timeout_seconds: int = 180) -> None:
        self.timeout_seconds = timeout_seconds
        self.workspace_root = BASE_DIR.parents[1].resolve()

    def validate(self, project: dict[str, Any]) -> BuildValidationReport:
        root = self._project_root(project)
        if get_settings().force_mock:
            return self._skipped("Build validation skipped in mock mode.")
        try:
            python_root = self._manifest_parent(root, "requirements.txt", ["", "apps/api", "backend"])
            if python_root is not None:
                return self._python(python_root)
            node_root = self._manifest_parent(root, "package.json", ["", "apps/api", "apps/web", "frontend", "backend"])
            if node_root is not None:
                return self._node(node_root)
            maven_root = self._manifest_parent(root, "pom.xml", ["", "apps/api", "backend"])
            if maven_root is not None:
                return self._maven(maven_root)
            return BuildValidationReport(
                installed="skipped",
                built="skipped",
                ok=True,
                skipped_reason="No supported build manifest was emitted.",
            )
        except subprocess.TimeoutExpired as exc:
            return BuildValidationReport(
                installed="failed",
                built="skipped",
                ok=False,
                skipped_reason=f"Build validation timed out after {self.timeout_seconds}s.",
                logs_tail=self._tail((exc.stdout or "") + "\n" + (exc.stderr or "")),
            )

    def _python(self, root: Path) -> BuildValidationReport:
        if shutil.which(sys.executable) is None:
            return self._skipped("Python executable is unavailable.")
        venv = root / ".ldcn-venv"
        create = self._run([sys.executable, "-m", "venv", str(venv)], root)
        if create.returncode != 0:
            return self._failed_install(create)
        pip = venv / ("Scripts/pip.exe" if sys.platform.startswith("win") else "bin/pip")
        install = self._run([str(pip), "install", "-r", "requirements.txt"], root)
        if install.returncode != 0:
            return self._failed_install(install)
        return BuildValidationReport(installed="passed", built="skipped", ok=True, logs_tail=self._tail(install.stdout + install.stderr))

    def _node(self, root: Path) -> BuildValidationReport:
        if not shutil.which("npm"):
            return self._skipped("npm is unavailable on the server.")
        install = self._run(["npm", "install"], root)
        if install.returncode != 0:
            return self._failed_install(install)
        build_status = "skipped"
        build_result = None
        package = (root / "package.json").read_text(encoding="utf-8", errors="ignore")
        if '"build"' in package:
            build_result = self._run(["npm", "run", "build"], root)
            build_status = "passed" if build_result.returncode == 0 else "failed"
        elif (root / "tsconfig.json").is_file():
            build_result = self._run(["npm", "exec", "tsc", "--", "--noEmit"], root)
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

    def _maven(self, root: Path) -> BuildValidationReport:
        if not shutil.which("mvn"):
            return self._skipped("mvn is unavailable on the server.")
        result = self._run(["mvn", "-q", "-DskipTests", "compile"], root)
        if result.returncode != 0:
            return BuildValidationReport(installed="failed", built="failed", ok=False, logs_tail=self._tail(result.stdout + result.stderr))
        return BuildValidationReport(installed="passed", built="passed", ok=True, logs_tail=self._tail(result.stdout + result.stderr))

    def _run(self, command: list[str], root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            cwd=root,
            text=True,
            capture_output=True,
            timeout=self.timeout_seconds,
            check=False,
        )

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
