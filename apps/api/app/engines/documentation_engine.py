from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION

# Documentation Library is a *visualization and validation layer* over the real
# project files. It never copies documentation into a separate store: the
# generated project on disk remains the single source of truth. Export only
# organizes the canonical files into the standard `/docs` layout in-place.

# (catalog id, canonical filename, category, required)
DOC_CATALOG: list[tuple[str, str, str, bool]] = [
    ("readme", "README.md", "overview", True),
    ("architecture", "ARCHITECTURE.md", "architecture", True),
    ("api", "API.md", "api", True),
    ("database", "DATABASE.md", "database", True),
    ("security", "SECURITY.md", "security", True),
    ("testing", "TESTING.md", "testing", True),
    ("deployment", "DEPLOYMENT.md", "deployment", True),
    ("changelog", "CHANGELOG.md", "overview", False),
    ("promptmaster", "PROMPTMASTER.md", "contract", False),
    ("blueprint", "BLUEPRINT.md", "contract", False),
    ("quality_report", "QUALITY_REPORT.md", "quality", False),
    ("openapi", "OPENAPI.yaml", "api", False),
]
# Some catalog docs ship under common alternate names in generated projects.
DOC_ALIASES: dict[str, set[str]] = {
    "openapi": {"openapi.yaml", "openapi.yml", "openapi.json"},
    "promptmaster": {"prompt_master.md", "promptmaster.md"},
    "quality_report": {"quality_report.md", "traceability.md"},
}

MIN_DOC_CHARS = 80
SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"\b(secret|token|password|api[_-]?key|private[_-]?key|credential|access[_-]?token)\b\s*[:=]\s*['\"]?([^'\"\s,;}{]{12,})",
    re.IGNORECASE,
)
SAFE_PLACEHOLDER_VALUES = {
    "change-me",
    "change-me-local-only",
    "local-preview-token",
    "placeholder",
    "example",
    "local-only",
    "your-",
    "<your",
    "xxxxxxxx",
}
# Content placeholders that mean the doc is still a stub, not finished prose.
PLACEHOLDER_TOKENS = ("TODO", "TBD", "FIXME", "LOREM IPSUM", "<PLACEHOLDER>", "REPLACE_ME", "{{", "XXX")
TEXT_SUFFIXES = {".md", ".markdown", ".yaml", ".yml", ".txt", ".json"}


class DocumentationEngine:
    """Reads, validates and scores a generated project's documentation.

    The engine owns no storage. It always analyzes the actual files inside the
    generated project root, keeping the architecture ready for a future
    Documentation Registry that would *reference* the same files.
    """

    def __init__(self) -> None:
        self.workspace_root = BASE_DIR.parents[1].resolve()

    # ----------------------------------------------------------------- public

    def analyze(self, project: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(project)
        docs, findings = self._discover_and_validate(root)

        missing_required = [doc["title"] for doc in docs if doc["required"] and not doc["present"]]
        present_required = [doc for doc in docs if doc["required"] and doc["present"]]
        inconsistent = [doc for doc in docs if doc["status"] == "inconsistent"]
        unsafe = [doc for doc in docs if doc["status"] == "unsafe"]
        drafts = [doc for doc in docs if doc["status"] == "draft"]

        score = max(
            0,
            100
            - len(missing_required) * 12
            - len(unsafe) * 25
            - len(inconsistent) * 8
            - len(drafts) * 4,
        )
        checks = self._build_checks(missing_required, inconsistent, unsafe, drafts)

        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": str(project["project_id"]),
            "project_name": str(project.get("project_name") or project["project_id"]),
            "generated_project_path": str(root),
            "score": score,
            "safe": not unsafe,
            "docs": docs,
            "checks": checks,
            "findings": findings,
            "missing_required": missing_required,
            "present_count": len([doc for doc in docs if doc["present"]]),
            "required_count": len([doc for doc in DOC_CATALOG if doc[3]]),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def export(self, project: dict[str, Any], *, organize: bool = False) -> dict[str, Any]:
        # Default behavior is COPY-to-docs: README stays at the root, the other
        # docs are copied into /docs and an INDEX is written, leaving the
        # originals untouched so links, scripts and tooling keep working.
        # Originals are only removed when the caller explicitly opts into
        # "organize and move" (organize=True).
        analysis = self.analyze(project)
        score = analysis["score"]
        if not analysis["safe"]:
            return {
                "contractVersion": CONTRACT_VERSION,
                "project_id": analysis["project_id"],
                "exported": False,
                "blocked": True,
                "reason": "Documentation contains exposed secrets and cannot be exported until they are removed.",
                "docs_dir": None,
                "exported_paths": [],
                "score": score,
            }
        if analysis["missing_required"]:
            return {
                "contractVersion": CONTRACT_VERSION,
                "project_id": analysis["project_id"],
                "exported": False,
                "blocked": True,
                "reason": "Required documentation is missing: " + ", ".join(analysis["missing_required"]),
                "docs_dir": None,
                "exported_paths": [],
                "score": score,
            }

        root = self._project_root(project)
        docs_dir = root / "docs"
        docs_dir.mkdir(exist_ok=True)
        exported: list[str] = []

        for doc in analysis["docs"]:
            if not doc["present"] or doc["path"] is None:
                continue
            # README stays at the project root; everything else is organized
            # into /docs. Files already inside /docs are left in place.
            if doc["id"] == "readme":
                exported.append(doc["path"])
                continue
            source = self._resolve_inside(root, doc["path"])
            target = docs_dir / Path(doc["path"]).name
            if source.resolve() == target.resolve():
                exported.append(self._relative(root, target))
                continue
            target.write_bytes(source.read_bytes())
            # Copy by default; only remove the original when organizing/moving.
            if organize:
                source.unlink()
            exported.append(self._relative(root, target))

        index_path = docs_dir / "INDEX.md"
        index_path.write_text(self._render_index(analysis), encoding="utf-8")
        exported.append(self._relative(root, index_path))

        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": analysis["project_id"],
            "exported": True,
            "blocked": False,
            "organized": organize,
            "reason": None,
            "docs_dir": str(docs_dir),
            "exported_paths": sorted(set(exported)),
            "score": score,
        }

    # ------------------------------------------------------------- discovery

    def _discover_and_validate(self, root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        index = self._file_index(root)
        signals = self._project_signals(root, index)
        docs: list[dict[str, Any]] = []
        findings: list[dict[str, Any]] = []

        for doc_id, filename, category, required in DOC_CATALOG:
            relative = self._match_doc(index, filename, DOC_ALIASES.get(doc_id, set()))
            if relative is None:
                docs.append(self._missing_doc(doc_id, filename, category, required))
                continue
            path = root / relative
            content = path.read_text(encoding="utf-8", errors="ignore")
            doc, doc_findings = self._validate_doc(
                doc_id, filename, category, required, relative, content, signals
            )
            docs.append(doc)
            findings.extend(doc_findings)
        return docs, findings

    def _validate_doc(
        self,
        doc_id: str,
        filename: str,
        category: str,
        required: bool,
        relative: str,
        content: str,
        signals: dict[str, bool],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        issues: list[str] = []
        findings: list[dict[str, Any]] = []
        status_value = "validated"

        secret = self._scan_secret(content)
        if secret is not None:
            status_value = "unsafe"
            issues.append("Exposed secret-like value detected; remove it before exporting.")
            findings.append(self._finding("exposed_secret", "critical", "security", secret, relative))

        inconsistencies = self._scan_consistency(content, signals)
        if inconsistencies and status_value != "unsafe":
            status_value = "inconsistent"
        for message in inconsistencies:
            issues.append(message)
            findings.append(self._finding("doc_inconsistency", "high", "consistency", message, relative))

        placeholders = [token for token in PLACEHOLDER_TOKENS if token in content.upper()]
        too_short = len(content.strip()) < MIN_DOC_CHARS
        if (placeholders or too_short) and status_value not in {"unsafe", "inconsistent"}:
            status_value = "draft"
        if placeholders:
            issues.append("Unresolved placeholders: " + ", ".join(sorted(set(placeholders))))
            findings.append(
                self._finding("placeholder", "warning", "quality", "Documentation contains unresolved placeholders.", relative)
            )
        if too_short:
            issues.append("Document is too short to be considered complete.")
            findings.append(
                self._finding("incomplete", "warning", "quality", "Document is too short to be complete.", relative)
            )

        return (
            {
                "contractVersion": CONTRACT_VERSION,
                "id": doc_id,
                "title": filename,
                "category": category,
                "required": required,
                "present": True,
                "status": status_value,
                "exported": relative.startswith("docs/"),
                "path": relative,
                "size_bytes": len(content.encode("utf-8")),
                "issues": issues,
            },
            findings,
        )

    def _missing_doc(self, doc_id: str, filename: str, category: str, required: bool) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": doc_id,
            "title": filename,
            "category": category,
            "required": required,
            "present": False,
            "status": "missing",
            "exported": False,
            "path": None,
            "size_bytes": 0,
            "issues": ["Required documentation is missing." if required else "Optional documentation is missing."],
        }

    # ----------------------------------------------------------- validation

    def _scan_secret(self, content: str) -> str | None:
        for match in SECRET_ASSIGNMENT_PATTERN.finditer(content):
            value = match.group(2).strip().strip("'\"")
            lowered = value.lower()
            if any(token in lowered for token in SAFE_PLACEHOLDER_VALUES):
                continue
            return f"Hardcoded {match.group(1).lower()} value found in documentation."
        return None

    def scan_secret(self, content: str) -> str | None:
        """Public wrapper so the AI writer validates against the same heuristic."""
        return self._scan_secret(content)

    def sanitize(self, content: str) -> str:
        """Redact secret-like values from generated documentation. The single
        source of truth for what counts as a secret stays in this engine, so the
        AI writer can never ship a credential the validator would later reject."""

        def _redact(match: re.Match[str]) -> str:
            value = match.group(2).strip().strip("'\"")
            if any(token in value.lower() for token in SAFE_PLACEHOLDER_VALUES):
                return match.group(0)
            return match.group(0).replace(match.group(2), "<redacted>")

        return SECRET_ASSIGNMENT_PATTERN.sub(_redact, content)

    def _scan_consistency(self, content: str, signals: dict[str, bool]) -> list[str]:
        lowered = content.lower()
        issues: list[str] = []
        if ("postgres" in lowered or "postgresql" in lowered) and not signals["has_postgres"]:
            issues.append("Documentation references PostgreSQL but the project has no PostgreSQL configuration.")
        if re.search(r"\bdocker\b", lowered) and not signals["has_docker"]:
            issues.append("Documentation references Docker but the project has no Dockerfile or docker-compose.")
        if ("jwt" in lowered or "bearer token" in lowered) and not signals["has_auth"]:
            issues.append("Documentation references JWT/auth but no authentication code was found in the project.")
        return issues

    def _project_signals(self, root: Path, index: dict[str, str]) -> dict[str, bool]:
        names = set(index.keys())
        haystacks = self._dependency_haystack(root, index)
        return {
            "has_docker": any(name in names for name in {"dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml"})
            or any("dockerfile" in name for name in names),
            "has_postgres": "postgres" in haystacks or "psycopg" in haystacks or "pg" in haystacks,
            "has_auth": "jwt" in haystacks
            or "jsonwebtoken" in haystacks
            or "passlib" in haystacks
            or "auth" in haystacks
            or any("auth" in name for name in names),
        }

    def _dependency_haystack(self, root: Path, index: dict[str, str]) -> str:
        chunks: list[str] = []
        for filename in ("requirements.txt", "pyproject.toml", "package.json", "docker-compose.yml", "docker-compose.yaml", ".env.example", "pom.xml"):
            relative = index.get(filename)
            if relative is None:
                continue
            try:
                chunks.append((root / relative).read_text(encoding="utf-8", errors="ignore").lower())
            except OSError:
                continue
        return "\n".join(chunks)

    def _build_checks(
        self,
        missing_required: list[str],
        inconsistent: list[dict[str, Any]],
        unsafe: list[dict[str, Any]],
        drafts: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [
            self._check(
                "completeness",
                "All required documents present",
                not missing_required,
                "Every required document is present.",
                f"Missing required documentation: {', '.join(missing_required)}.",
            ),
            self._check(
                "consistency",
                "Documentation matches the project",
                not inconsistent,
                "Documentation is consistent with the generated project.",
                f"{len(inconsistent)} document(s) describe technology the project does not contain.",
            ),
            self._check(
                "security",
                "No secrets exposed in documentation",
                not unsafe,
                "No secrets were found in the documentation.",
                f"{len(unsafe)} document(s) expose secret-like values.",
                required=True,
            ),
            self._check(
                "quality",
                "Documentation is complete and placeholder-free",
                not drafts,
                "Documentation has no placeholders or stubs.",
                f"{len(drafts)} document(s) still contain placeholders or are too short.",
            ),
        ]

    # ---------------------------------------------------------------- helpers

    def _file_index(self, root: Path) -> dict[str, str]:
        """basename(lower) -> first relative posix path, root files preferred."""
        index: dict[str, str] = {}
        for item in sorted(root.rglob("*")):
            if not item.is_file():
                continue
            relative = item.relative_to(root).as_posix()
            name = item.name.lower()
            # Prefer a root-level file over a nested one with the same name.
            if name not in index or "/" not in relative:
                index[name] = relative
        return index

    def _match_doc(self, index: dict[str, str], filename: str, aliases: set[str]) -> str | None:
        candidates = {filename.lower(), *aliases}
        for name in candidates:
            if name in index:
                return index[name]
        return None

    def _check(
        self,
        check_id: str,
        label: str,
        passed: bool,
        passed_message: str,
        failed_message: str,
        *,
        required: bool = False,
    ) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": check_id,
            "label": label,
            "status": "passed" if passed else ("failed" if required else "warning"),
            "message": passed_message if passed else failed_message,
        }

    def _finding(self, code: str, severity: str, category: str, message: str, path: str | None) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "code": code,
            "severity": severity,
            "category": category,
            "message": message,
            "path": path,
        }

    def _render_index(self, analysis: dict[str, Any]) -> str:
        lines = [
            f"# {analysis['project_name']} — Documentation Index",
            "",
            f"_Generated by LDCN OS Documentation Library on {analysis['generated_at']}._",
            "",
            f"**Documentation Score:** {analysis['score']}/100",
            "",
            "| Document | Category | Status |",
            "| --- | --- | --- |",
        ]
        for doc in analysis["docs"]:
            lines.append(f"| {doc['title']} | {doc['category']} | {doc['status']} |")
        lines.append("")
        return "\n".join(lines)

    def _relative(self, root: Path, target: Path) -> str:
        return target.resolve().relative_to(root.resolve()).as_posix()

    def _resolve_inside(self, root: Path, relative_path: str) -> Path:
        candidate = Path(relative_path)
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        target = (root / candidate).resolve()
        if root not in target.parents and target != root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        return target

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw_path = project.get("generated_project_path")
        if not raw_path:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project has no generated project path. Run local generation first.",
            )
        root = Path(str(raw_path)).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project path does not exist.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Generated project path must stay inside the LDCN OS workspace.",
            )
        if not (root / ".ldcn-generation.json").is_file():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project metadata was not found.")
        return root
