from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION
from app.services.generated_project_service import DOWNLOAD_DIR

TEXT_EXTENSIONS = {
    ".java",
    ".json",
    ".md",
    ".py",
    ".properties",
    ".ts",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
SECRET_FILE_PATTERN = re.compile(r"(^|/)(\.env($|\.)|id_rsa|.*\.(pem|p12|pfx)$)", re.IGNORECASE)
# Env *templates* are mandatory in generated projects and live in any directory
# (root, backend/, frontend/, …). They are not real secret files, so they are
# exempt from the "real .env" critical finding — their CONTENT is still scanned for
# real hardcoded secrets, so a template that ships a real value is still flagged.
ENV_TEMPLATE_NAMES = {".env.example", ".env.sample", ".env.template", ".env.dist"}
SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"\b(secret|token|password|api[_-]?key|private[_-]?key|credential|access[_-]?token)\b\s*[:=]\s*['\"]?([^'\"\s,;}{]{12,})",
    re.IGNORECASE,
)
SAFE_PLACEHOLDERS = {
    "change-me",
    "change-me-local-only",
    "local-preview-token",
    "placeholder",
    "example",
    "local-only",
    "password",
    "user:password",
}


class GeneratedProjectQualityEngine:
    def __init__(self) -> None:
        self.workspace_root = BASE_DIR.parents[1].resolve()

    def quality_check(self, project: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(project)
        manifest = self._read_manifest(root)
        framework = self._framework(project, manifest)
        profile_id = str(((manifest.get("profile") or {}).get("profile_id") or "")).strip() or None
        template_id = str(manifest.get("template_id") or "").strip() or None

        checks: list[dict[str, Any]] = []
        missing_files: list[str] = []
        warnings: list[str] = []
        security_findings: list[dict[str, Any]] = []

        self._manifest_checks(root, manifest, checks, missing_files)
        self._framework_checks(root, framework, profile_id, checks, missing_files)
        self._readme_check(root, checks, warnings)
        self._env_example_check(root, checks, warnings, missing_files)
        self._blueprint_check(project, manifest, framework, checks, warnings)
        self._security_checks(project, root, checks, warnings, security_findings)

        required_failures = [item for item in checks if item["required"] and item["status"] == "failed"]
        blocking_findings = [item for item in security_findings if item["severity"] in {"high", "critical"}]
        passed = not required_failures and not blocking_findings
        score = max(0, 100 - (len(required_failures) * 10) - (len(blocking_findings) * 18) - (len(warnings) * 3))
        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project["project_id"],
            "framework": framework,
            "template_id": template_id,
            "profile_id": profile_id,
            "passed": passed,
            "failed": not passed,
            "score": score,
            "checks": checks,
            "warnings": warnings,
            "missing_files": sorted(set(missing_files)),
            "security_findings": security_findings,
        }

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw_path = project.get("generated_project_path")
        if not raw_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project has no generated project path.")
        root = Path(str(raw_path)).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project path does not exist.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project path must stay inside workspace.")
        if not (root / ".ldcn-generation.json").is_file():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project manifest was not found.")
        return root

    def _read_manifest(self, root: Path) -> dict[str, Any]:
        for name in [".ldcn-backend-generation.json", ".ldcn-generation.json"]:
            path = root / name
            if path.is_file():
                try:
                    return json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError as exc:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Generated manifest is invalid JSON: {name}") from exc
        return {}

    def _framework(self, project: dict[str, Any], manifest: dict[str, Any]) -> str:
        manifest_framework = str(manifest.get("framework") or "").strip()
        if manifest_framework:
            return manifest_framework
        return str(((project.get("technology_graph") or {}).get("framework") or {}).get("id") or "unknown")

    def _manifest_checks(self, root: Path, manifest: dict[str, Any], checks: list[dict[str, Any]], missing_files: list[str]) -> None:
        self._require_file(root, ".ldcn-generation.json", "manifest_base", "Base generation manifest exists", "manifest", checks, missing_files)
        self._require_file(root, ".ldcn-backend-generation.json", "manifest_backend", "Backend generation manifest exists", "manifest", checks, missing_files)
        safe_flags = all(bool(manifest.get(flag)) for flag in ["deterministic", "no_ai", "no_agents", "no_shell_execution", "no_external_access"])
        self._check(
            checks,
            "manifest_safety_flags",
            "Manifest declares deterministic local generation constraints",
            "manifest",
            safe_flags,
            True,
            "Manifest confirms deterministic local generation without AI, agents, shell execution, or external access.",
            "Manifest is missing one or more deterministic local safety flags.",
            [".ldcn-backend-generation.json"],
        )

    def _framework_checks(
        self,
        root: Path,
        framework: str,
        profile_id: str | None,
        checks: list[dict[str, Any]],
        missing_files: list[str],
    ) -> None:
        if framework == "fastapi":
            self._require_file(root, "requirements.txt", "fastapi_requirements", "FastAPI requirements.txt exists", "structure", checks, missing_files)
            self._require_file(root, "app/main.py", "fastapi_main", "FastAPI app/main.py exists", "structure", checks, missing_files)
            self._require_dir_with_file(root, "app/api", "fastapi_routers", "FastAPI routers exist", "structure", checks, missing_files)
            if profile_id and "crud" in profile_id:
                self._require_dir_with_file(root, "app/schemas", "fastapi_crud_schemas", "FastAPI CRUD schemas exist", "structure", checks, missing_files)
            else:
                self._require_dir(root, "app/schemas", "fastapi_schemas_dir", "FastAPI schemas directory exists", "structure", checks, missing_files)
            self._require_dir_with_file(root, "tests", "fastapi_tests", "FastAPI tests exist", "structure", checks, missing_files)
            return

        if framework == "spring_boot":
            self._require_file(root, "pom.xml", "spring_pom", "Spring Boot pom.xml exists", "structure", checks, missing_files)
            self._require_dir(root, "src/main/java", "spring_java_root", "Spring Boot Java root exists", "structure", checks, missing_files)
            for folder in ["controller", "service", "repository"]:
                self._require_any_dir(root, f"spring_{folder}", f"Spring Boot {folder} package exists", "structure", checks, missing_files, folder)
            self._require_file(root, "src/main/resources/application.yml", "spring_application_yml", "Spring Boot application.yml exists", "structure", checks, missing_files)
            self._require_file(root, "README.md", "spring_readme", "Spring Boot README exists", "readme", checks, missing_files)
            self._require_file(root, ".gitignore", "spring_gitignore", "Spring Boot .gitignore exists", "structure", checks, missing_files)
            return

        if framework == "nestjs":
            self._require_file(root, "package.json", "nestjs_package", "NestJS package.json exists", "structure", checks, missing_files)
            self._require_file(root, "src/main.ts", "nestjs_main", "NestJS src/main.ts exists", "structure", checks, missing_files)
            for folder in ["modules", "controllers", "services"]:
                self._require_dir(root, f"src/{folder}", f"nestjs_{folder}", f"NestJS {folder} directory exists", "structure", checks, missing_files)
            self._require_file(root, "tsconfig.json", "nestjs_tsconfig", "NestJS tsconfig.json exists", "structure", checks, missing_files)
            return

        self._check(
            checks,
            "framework_supported",
            "Framework is supported by Generated Project Quality Gate V1",
            "structure",
            False,
            True,
            "Framework is supported.",
            f"Unsupported generated backend framework: {framework}.",
            [framework],
        )

    def _readme_check(self, root: Path, checks: list[dict[str, Any]], warnings: list[str]) -> None:
        path = root / "README.md"
        exists = path.is_file()
        content = path.read_text(encoding="utf-8", errors="ignore").strip() if exists else ""
        ok = exists and len(content) >= 24
        self._check(
            checks,
            "readme_content",
            "README exists and contains generated project guidance",
            "readme",
            ok,
            True,
            "README is present and non-empty.",
            "README.md is missing or too small to describe the generated project.",
            ["README.md"],
        )
        if exists and "Generated by LDCN OS" not in content:
            warnings.append("README does not identify LDCN OS as the deterministic generator.")

    def _env_example_check(
        self,
        root: Path,
        checks: list[dict[str, Any]],
        warnings: list[str],
        missing_files: list[str],
    ) -> None:
        if (root / "pom.xml").is_file():
            return
        self._require_file(root, ".env.example", "env_example_exists", ".env.example exists", "env", checks, missing_files)
        path = root / ".env.example"
        if not path.is_file():
            return
        content = path.read_text(encoding="utf-8", errors="ignore").strip()
        self._check(
            checks,
            "env_example_content",
            ".env.example contains safe local placeholders",
            "env",
            bool(content),
            True,
            ".env.example is present and non-empty.",
            ".env.example is empty.",
            [".env.example"],
        )
        if SECRET_ASSIGNMENT_PATTERN.search(content) and not self._is_safe_env_example(content):
            warnings.append(".env.example contains secret-like keys; values must remain placeholders only.")

    def _blueprint_check(
        self,
        project: dict[str, Any],
        manifest: dict[str, Any],
        framework: str,
        checks: list[dict[str, Any]],
        warnings: list[str],
    ) -> None:
        project_framework = str(((project.get("technology_graph") or {}).get("framework") or {}).get("id") or "")
        project_language = str(((project.get("technology_graph") or {}).get("language") or {}).get("id") or "")
        manifest_language = str(manifest.get("language") or "")
        self._check(
            checks,
            "blueprint_framework_coherence",
            "Generated framework matches blueprint technology graph",
            "blueprint",
            not project_framework or project_framework == framework,
            True,
            "Generated framework matches the persisted blueprint.",
            f"Generated framework '{framework}' does not match blueprint framework '{project_framework}'.",
            [project_framework, framework],
        )
        if project_language and manifest_language and project_language != manifest_language:
            warnings.append(f"Generated language '{manifest_language}' differs from blueprint language '{project_language}'.")

    def _security_checks(
        self,
        project: dict[str, Any],
        root: Path,
        checks: list[dict[str, Any]],
        warnings: list[str],
        security_findings: list[dict[str, Any]],
    ) -> None:
        traversal_ok = True
        for item in root.rglob("*"):
            relative_path = item.relative_to(root).as_posix()
            if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
                traversal_ok = False
                self._finding(security_findings, "path_traversal", "critical", "Unsafe relative path was detected.", relative_path)
            if item.is_symlink():
                target = item.resolve()
                if root not in target.parents and target != root:
                    traversal_ok = False
                    self._finding(security_findings, "symlink_escape", "critical", "Symlink points outside generated project root.", relative_path)

            if item.is_file():
                self._scan_secret_file(root, item, security_findings)
                self._scan_secret_content(root, item, security_findings)

        self._check(
            checks,
            "path_traversal_blocked",
            "Path traversal is impossible inside generated project tree",
            "security",
            traversal_ok,
            True,
            "All generated paths resolve inside the generated project root.",
            "Unsafe path traversal or symlink escape detected.",
            [str(root)],
        )
        self._zip_check(project, checks, warnings, security_findings)

    def _zip_check(
        self,
        project: dict[str, Any],
        checks: list[dict[str, Any]],
        warnings: list[str],
        security_findings: list[dict[str, Any]],
    ) -> None:
        zip_path = DOWNLOAD_DIR / f"{re.sub(r'[^a-zA-Z0-9_.-]', '_', project['project_id'])}.zip"
        if not zip_path.is_file():
            warnings.append("ZIP not prepared yet; root containment will be validated when a ZIP exists.")
            self._check(
                checks,
                "zip_root_safe",
                "ZIP does not contain LDCN OS root",
                "zip",
                True,
                False,
                "No prepared ZIP exists yet; generated project root remains local.",
                "Prepared ZIP is unsafe.",
                [str(zip_path)],
            )
            return
        zip_ok = True
        with zipfile.ZipFile(zip_path) as archive:
            for name in archive.namelist():
                normalized = name.replace("\\", "/")
                if normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized:
                    zip_ok = False
                    self._finding(security_findings, "zip_path_traversal", "critical", "ZIP entry contains path traversal.", normalized)
                if normalized.startswith(("apps/", "packages/", ".git/", "reports/")):
                    zip_ok = False
                    self._finding(security_findings, "zip_workspace_root", "critical", "ZIP appears to contain LDCN OS workspace root content.", normalized)
        self._check(
            checks,
            "zip_root_safe",
            "ZIP does not contain LDCN OS root",
            "zip",
            zip_ok,
            True,
            "Prepared ZIP entries stay inside the generated project.",
            "Prepared ZIP contains unsafe workspace or traversal entries.",
            [str(zip_path)],
        )

    def _scan_secret_file(self, root: Path, path: Path, security_findings: list[dict[str, Any]]) -> None:
        relative_path = path.relative_to(root).as_posix()
        # Env templates (in ANY directory) are expected, not real secret files.
        if path.name.lower() in ENV_TEMPLATE_NAMES:
            return
        if SECRET_FILE_PATTERN.search(relative_path):
            self._finding(security_findings, "real_env_or_secret_file", "critical", "Real .env or secret-like file is not allowed in generated projects.", relative_path)

    def _scan_secret_content(self, root: Path, path: Path, security_findings: list[dict[str, Any]]) -> None:
        is_env_template = path.name.lower() in ENV_TEMPLATE_NAMES
        if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in {".gitignore"} and not is_env_template:
            return
        relative_path = path.relative_to(root).as_posix()
        content = path.read_text(encoding="utf-8", errors="ignore")
        if is_env_template and self._is_safe_env_example(content):
            return
        for match in SECRET_ASSIGNMENT_PATTERN.finditer(content):
            value = match.group(2).strip().strip("'\"")
            if self._safe_placeholder_value(value):
                continue
            self._finding(security_findings, "hardcoded_secret", "high", "Secret-like hardcoded value detected.", relative_path)
            break

    def _is_safe_env_example(self, content: str) -> bool:
        for match in SECRET_ASSIGNMENT_PATTERN.finditer(content):
            if not self._safe_placeholder_value(match.group(2)):
                return False
        return True

    def _safe_placeholder_value(self, value: str) -> bool:
        lowered = value.lower()
        return any(token in lowered for token in SAFE_PLACEHOLDERS)

    def _require_file(
        self,
        root: Path,
        relative_path: str,
        check_id: str,
        label: str,
        category: str,
        checks: list[dict[str, Any]],
        missing_files: list[str],
    ) -> None:
        exists = (root / relative_path).is_file()
        if not exists:
            missing_files.append(relative_path)
        self._check(checks, check_id, label, category, exists, True, f"{relative_path} exists.", f"{relative_path} is missing.", [relative_path])

    def _require_dir(
        self,
        root: Path,
        relative_path: str,
        check_id: str,
        label: str,
        category: str,
        checks: list[dict[str, Any]],
        missing_files: list[str],
    ) -> None:
        exists = (root / relative_path).is_dir()
        if not exists:
            missing_files.append(relative_path)
        self._check(checks, check_id, label, category, exists, True, f"{relative_path} exists.", f"{relative_path} is missing.", [relative_path])

    def _require_dir_with_file(
        self,
        root: Path,
        relative_path: str,
        check_id: str,
        label: str,
        category: str,
        checks: list[dict[str, Any]],
        missing_files: list[str],
    ) -> None:
        directory = root / relative_path
        exists = directory.is_dir() and any(item.is_file() and item.name != "__init__.py" for item in directory.rglob("*"))
        if not exists:
            missing_files.append(relative_path)
        self._check(checks, check_id, label, category, exists, True, f"{relative_path} contains generated files.", f"{relative_path} is missing or empty.", [relative_path])

    def _require_any_dir(
        self,
        root: Path,
        check_id: str,
        label: str,
        category: str,
        checks: list[dict[str, Any]],
        missing_files: list[str],
        directory_name: str,
    ) -> None:
        exists = any(item.is_dir() and item.name == directory_name for item in (root / "src" / "main" / "java").rglob("*")) if (root / "src" / "main" / "java").is_dir() else False
        if not exists:
            missing_files.append(f"src/main/java/**/{directory_name}")
        self._check(
            checks,
            check_id,
            label,
            category,
            exists,
            True,
            f"{directory_name} package exists under src/main/java.",
            f"{directory_name} package is missing under src/main/java.",
            [f"src/main/java/**/{directory_name}"],
        )

    def _check(
        self,
        checks: list[dict[str, Any]],
        check_id: str,
        label: str,
        category: str,
        passed: bool,
        required: bool,
        passed_message: str,
        failed_message: str,
        paths: list[str],
    ) -> None:
        checks.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "id": check_id,
                "label": label,
                "category": category,
                "status": "passed" if passed else ("failed" if required else "warning"),
                "required": required,
                "message": passed_message if passed else failed_message,
                "paths": paths,
            }
        )

    def _finding(
        self,
        security_findings: list[dict[str, Any]],
        code: str,
        severity: str,
        message: str,
        path: str | None,
    ) -> None:
        security_findings.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "code": code,
                "severity": severity,
                "message": message,
                "path": path,
            }
        )
