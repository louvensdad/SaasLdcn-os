from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.schemas.quality_gate import QualityIssue

# External Integration Auditor: the policy's "External APIs Governance" section --
# third-party integrations (Stripe, SendGrid, ...) must be OPT-IN ONLY (never
# silently added by the LLM) and, once approved, must carry real
# timeout/retry/resilience handling and test coverage. Nothing in this codebase
# verified either half of that before this engine (confirmed by the Engineering
# Policy gap audit): the backend prompt never mentioned these providers, and no
# deterministic check cross-referenced generated code against what the user
# actually approved.
#
# Scope (honest, not "100%"): only the 4 providers the Wizard's Infrastructure
# Registry already lets a user opt into (stripe, sendgrid, resend, mercado_pago
# -- see infrastructure_registry_service.py). Extending this to Twilio/OpenAI/
# WhatsApp/Firebase requires first adding them to the Dependency Graph Engine's
# node catalog (dependency_graph_engine.py), a separate, larger piece of work
# not done here.

_IGNORED_DIRS = {"node_modules", ".git", ".ldcn-venv", "dist", "build", "target", "__pycache__"}
_MANIFEST_NAMES = {"package.json", "requirements.txt"}
_TEST_PATH_HINT_RE = re.compile(r"(^|/)(tests?|__tests__|specs?)(/|$)|\.(test|spec)\.\w+$", re.IGNORECASE)


@dataclass(frozen=True)
class ProviderSignature:
    provider_id: str  # matches InfrastructureProvider / INFRASTRUCTURE_IDS
    display_name: str
    manifest_packages: dict[str, tuple[str, ...]]  # ecosystem -> package name(s)
    keyword: str  # case-insensitive token to spot provider usage in source


_RESILIENCE_KEYWORDS = ("timeout", "retry", "circuit", "backoff", "fallback")

PROVIDER_SIGNATURES: tuple[ProviderSignature, ...] = (
    ProviderSignature("stripe", "Stripe", {"npm": ("stripe",), "pypi": ("stripe",)}, "stripe"),
    ProviderSignature("sendgrid", "SendGrid", {"npm": ("@sendgrid/mail",), "pypi": ("sendgrid",)}, "sendgrid"),
    ProviderSignature("resend", "Resend", {"npm": ("resend",), "pypi": ("resend",)}, "resend"),
    ProviderSignature("mercado_pago", "Mercado Pago", {"npm": ("mercadopago",), "pypi": ("mercadopago", "mercado-pago-sdk")}, "mercadopago"),
)


def _iter_source_files(root: Path, *, suffixes: tuple[str, ...]) -> list[Path]:
    out: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        if any(part in _IGNORED_DIRS for part in path.parts):
            continue
        out.append(path)
    return out


def _safe_read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


class ExternalIntegrationAuditEngine:
    def audit(self, project: dict[str, Any]) -> list[QualityIssue]:
        root = self._root(project)
        if root is None:
            return []
        selected_ids = set(self._selected_infrastructure_ids(root))
        manifest_text = self._manifest_text(root)
        source_files = _iter_source_files(root, suffixes=(".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go"))

        issues: list[QualityIssue] = []
        for signature in PROVIDER_SIGNATURES:
            if not self._is_declared(signature, manifest_text):
                continue  # this provider's SDK isn't even a dependency -- nothing to audit
            if signature.provider_id not in selected_ids:
                issues.append(self._not_opted_in_issue(signature))
                continue  # an integration nobody approved is the BLOCKER; skip the finer checks
            referencing = [p for p in source_files if signature.keyword in _safe_read(p).lower()]
            if referencing and not any(
                any(word in _safe_read(p).lower() for word in _RESILIENCE_KEYWORDS) for p in referencing
            ):
                issues.append(self._missing_resilience_issue(signature, referencing[0]))
            if referencing and not self._has_test_coverage(root, signature):
                issues.append(self._missing_tests_issue(signature))
        return issues

    # ------------------------------------------------------------------ setup
    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        return root if root.is_dir() else None

    def _selected_infrastructure_ids(self, root: Path) -> list[str]:
        manifest = root / "ldcn.project.json"
        if not manifest.is_file():
            return []
        try:
            data = json.loads(manifest.read_text(encoding="utf-8", errors="ignore"))
        except (OSError, ValueError):
            return []
        ids = data.get("selected_infrastructure_ids") if isinstance(data, dict) else None
        return [str(item) for item in ids] if isinstance(ids, list) else []

    def _manifest_text(self, root: Path) -> str:
        chunks: list[str] = []
        for path in root.rglob("*"):
            if not path.is_file() or path.name not in _MANIFEST_NAMES:
                continue
            if any(part in _IGNORED_DIRS for part in path.parts):
                continue
            chunks.append(_safe_read(path))
        return "\n".join(chunks)

    def _is_declared(self, signature: ProviderSignature, manifest_text: str) -> bool:
        return any(
            package.lower() in manifest_text.lower()
            for packages in signature.manifest_packages.values()
            for package in packages
        )

    def _has_test_coverage(self, root: Path, signature: ProviderSignature) -> bool:
        for path in _iter_source_files(root, suffixes=(".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go")):
            if not _TEST_PATH_HINT_RE.search(path.as_posix()):
                continue
            if signature.keyword in _safe_read(path).lower():
                return True
        return False

    # ---------------------------------------------------------------- issues
    def _not_opted_in_issue(self, signature: ProviderSignature) -> QualityIssue:
        return QualityIssue(
            id=f"external_integration_not_opted_in:{signature.provider_id}",
            title=f"Integração externa não aprovada em uso: {signature.display_name}",
            severity="BLOCKER",
            category="integration",
            file=None,
            root_cause=(
                f"O SDK de {signature.display_name} está declarado no manifesto do projeto, mas o usuário nunca "
                "aprovou este provedor na seleção de infraestrutura (Wizard). Integrações externas são opt-in: "
                "nunca podem ser adicionadas silenciosamente pela geração."
            ),
            suggested_fix=(
                f"Remova a dependência em {signature.display_name} se não for necessária, ou peça ao usuário "
                "para aprová-la explicitamente na seleção de infraestrutura antes de regenerar."
            ),
            auto_fixable=False,
        )

    def _missing_resilience_issue(self, signature: ProviderSignature, example_file: Path) -> QualityIssue:
        return QualityIssue(
            id=f"external_integration_missing_resilience:{signature.provider_id}",
            title=f"Integração com {signature.display_name} sem tratamento de resiliência",
            severity="WARNING",
            category="integration",
            file=None,
            root_cause=(
                f"O código que usa {signature.display_name} não apresenta timeout, retry, circuit breaker ou "
                "fallback -- uma chamada externa sem esse tratamento derruba o fluxo inteiro quando o provedor "
                "está lento ou indisponível."
            ),
            suggested_fix=(
                f"Adicione timeout explícito, retry com backoff e um fallback/circuit breaker nas chamadas a "
                f"{signature.display_name}."
            ),
            auto_fixable=False,
        )

    def _missing_tests_issue(self, signature: ProviderSignature) -> QualityIssue:
        return QualityIssue(
            id=f"external_integration_missing_tests:{signature.provider_id}",
            title=f"Integração com {signature.display_name} sem testes/mocks",
            severity="WARNING",
            category="integration",
            file=None,
            root_cause=f"Nenhum teste referencia a integração com {signature.display_name} (nem mesmo com um mock).",
            suggested_fix=f"Adicione um teste com mock da API de {signature.display_name} para o fluxo principal.",
            auto_fixable=False,
        )


external_integration_audit_engine = ExternalIntegrationAuditEngine()
