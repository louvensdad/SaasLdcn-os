from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from app.schemas.modernize import (
    ArchitectureSmell,
    CodebaseInventory,
    Diagnosis,
    IngestedFile,
    SecurityFinding,
)
from app.services.codebase_ingest_service import CodebaseIngestError, CodebaseIngestService

# Deep diagnosis (PASSO 3): from an ingested codebase, detect the stack, surface
# architecture smells, and run a deterministic secret/security scan. This never
# executes the legacy code — it only reads the inventoried text files.

# Regexes for the secret scan. Conservative on purpose (favours precision): each
# pattern targets a high-signal credential shape, not a generic "password" word.
_SECRET_PATTERNS: list[tuple[str, str, str]] = [
    ("aws_access_key", "high", r"AKIA[0-9A-Z]{16}"),
    ("private_key", "critical", r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    ("generic_api_key", "high", r"(?i)(?:api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]"),
    ("hardcoded_password", "medium", r"(?i)password\s*[:=]\s*['\"][^'\"]{6,}['\"]"),
    ("dangerous_eval", "medium", r"\b(?:eval|exec)\s*\("),
]

_STACK_MARKERS: list[tuple[str, str, str]] = [
    ("pom.xml", "java", "Java / Maven (Spring Boot)"),
    ("build.gradle", "java", "Java / Gradle"),
    ("next.config.js", "typescript", "Next.js"),
    ("next.config.ts", "typescript", "Next.js"),
    ("package.json", "javascript", "Node.js"),
    ("requirements.txt", "python", "Python"),
    ("pyproject.toml", "python", "Python"),
    ("go.mod", "go", "Go"),
    ("Gemfile", "ruby", "Ruby"),
]


def build_inventory(
    ingest_id: str,
    source: str,
    skipped: int,
    service: CodebaseIngestService,
) -> CodebaseInventory:
    files: list[IngestedFile] = []
    languages: Counter[str] = Counter()
    total = 0
    for rel, abs_path, language in service.iter_files(ingest_id):
        size = abs_path.stat().st_size
        files.append(IngestedFile(path=rel, size_bytes=size, language=language))
        languages[language] += 1
        total += size
    return CodebaseInventory(
        ingest_id=ingest_id,
        source=source,  # type: ignore[arg-type]
        file_count=len(files),
        total_bytes=total,
        skipped_count=skipped,
        languages=dict(languages),
        files=files,
    )


def analyze(ingest_id: str, inventory: CodebaseInventory, service: CodebaseIngestService) -> Diagnosis:
    root = service.root_for(ingest_id)
    names = {Path(f.path).name for f in inventory.files}

    detected_stack, primary_language = _detect_stack(names, inventory)
    languages = sorted(inventory.languages, key=lambda k: inventory.languages[k], reverse=True)

    smells = _detect_smells(inventory, names)
    dependency_notes = _dependency_notes(root, names)
    security = _scan_secrets(ingest_id, service)

    return Diagnosis(
        detected_stack=detected_stack,
        primary_language=primary_language or (languages[0] if languages else "unknown"),
        languages=languages,
        dependency_notes=dependency_notes,
        smells=smells,
        security_findings=security,
    )


def _detect_stack(names: set[str], inventory: CodebaseInventory) -> tuple[str, str]:
    for marker, language, label in _STACK_MARKERS:
        if marker in names:
            return label, language
    if inventory.languages:
        top = max(inventory.languages, key=lambda k: inventory.languages[k])
        return f"{top} (inferred from file extensions)", top
    return "unknown", "unknown"


def _detect_smells(inventory: CodebaseInventory, names: set[str]) -> list[ArchitectureSmell]:
    smells: list[ArchitectureSmell] = []
    paths = [f.path for f in inventory.files]

    if not any("test" in p.lower() or "spec" in p.lower() for p in paths):
        smells.append(ArchitectureSmell(code="no_tests", message="Nenhuma suíte de testes detectada."))
    if not any("dockerfile" in p.lower() for p in paths) and "Dockerfile" not in names:
        smells.append(ArchitectureSmell(code="no_containerization", message="Sem Dockerfile: empacotamento não reproduzível."))
    if not any(p.lower().endswith((".github/workflows", "ci.yml", "ci.yaml")) or "workflows" in p for p in paths):
        smells.append(ArchitectureSmell(code="no_ci", message="Sem pipeline CI/CD detectado."))

    # "Fat controller" heuristic: controllers/routes that also look like they hold
    # business logic (no separate service/use-case layer present).
    has_controllers = any(re.search(r"controller|routes?|handler", p, re.I) for p in paths)
    has_services = any(re.search(r"service|use[_-]?case|application", p, re.I) for p in paths)
    if has_controllers and not has_services:
        smells.append(
            ArchitectureSmell(
                code="logic_in_controllers",
                message="Controllers sem camada de serviço/use-case: risco de regra de negócio no controller.",
                related_paths=[p for p in paths if re.search(r"controller|routes?|handler", p, re.I)][:5],
            )
        )
    return smells


def _dependency_notes(root: Path, names: set[str]) -> list[str]:
    notes: list[str] = []
    if "requirements.txt" in names:
        text = _read(root / "requirements.txt")
        if re.search(r"(?i)\bdjango\s*[<=]+\s*[12]\.", text):
            notes.append("Django legado (< 3.x) detectado: fora de suporte de segurança.")
        if re.search(r"(?i)\bflask\s*[<=]+\s*0\.", text):
            notes.append("Flask 0.x detectado: versão muito antiga.")
    if "package.json" in names:
        text = _read(root / "package.json")
        if re.search(r'"react"\s*:\s*"[\^~]?(?:1[0-6]|[0-9])\.', text):
            notes.append("React legado (< 17) detectado.")
        if re.search(r'"express"\s*:\s*"[\^~]?[0-3]\.', text):
            notes.append("Express < 4 detectado.")
    if not notes:
        notes.append("Nenhuma dependência criticamente obsoleta detectada pela varredura heurística.")
    return notes


def _scan_secrets(ingest_id: str, service: CodebaseIngestService) -> list[SecurityFinding]:
    findings: list[SecurityFinding] = []
    for rel, abs_path, _language in service.iter_files(ingest_id):
        text = _read(abs_path)
        if not text:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for code, severity, pattern in _SECRET_PATTERNS:
                if re.search(pattern, line):
                    findings.append(
                        SecurityFinding(
                            severity=severity,  # type: ignore[arg-type]
                            code=code,
                            message=f"Possível {code.replace('_', ' ')} embutido no código.",
                            path=rel,
                            line=lineno,
                        )
                    )
            if len(findings) >= 200:  # cap to keep responses bounded
                return findings
    return findings


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except (OSError, CodebaseIngestError):
        return ""
