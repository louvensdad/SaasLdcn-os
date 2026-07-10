from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.engines.ground_truth_engine import GroundTruthState

# Execution Reality Guard: validates LLM output against the Ground Truth state
# BEFORE it reaches the user or the project. A response that instructs the user
# to clone a repository that was never created, bring docker up on a build that
# never passed, or deploy a pipeline that failed is rejected, regenerated with
# failure-aware context, and — if it still violates — sanitized into an honest
# diagnostic note.
#
# Two validation modes, because generated PROJECT FILES and USER-FACING guidance
# make different claims:
# - "artifact": content of the generated project itself. A README that documents
#   `docker compose up` as how to run the FINAL product is legitimate product
#   documentation. What is NEVER legitimate is a `git clone <url>` (no remote
#   repository exists until the user exports) or a claim that the build/deploy
#   already succeeded. In failure state (DIAGNOSTIC ONLY) execution instructions
#   are blocked here too.
# - "response": text presented to the user about what to do NOW (diagnostics,
#   summaries). Full rule set: nothing executable unless the state confirms it.

Mode = Literal["artifact", "response"]

_GIT_CLONE_RE = re.compile(r"git\s+clone\s+\S+", re.IGNORECASE)
_DOCKER_RE = re.compile(r"docker(?:-|\s+)compose\s+\w+|docker\s+(?:run|build|push)\b", re.IGNORECASE)
_DEPLOY_RE = re.compile(
    r"kubectl\s+(?:apply|create|rollout)|helm\s+(?:install|upgrade)|terraform\s+apply"
    r"|vercel(?:\s+--prod|\s+deploy)|npm\s+publish|gh\s+release|fly\s+deploy|serverless\s+deploy"
    r"|\bdeploy\s+(?:em|to|para)\s+produ",
    re.IGNORECASE,
)
# Invented success/state claims that contradict a non-successful ground truth.
_SUCCESS_CLAIM_RE = re.compile(
    r"(?:projeto|aplicac[aã]o|sistema)\s+(?:foi\s+)?(?:gerad[oa]|criad[oa]|conclu[ií]d[oa])\s+com\s+sucesso"
    r"|build\s+(?:passou|conclu[ií]d[oa]|aprovad[oa]|succeeded|passed)"
    r"|pipeline\s+(?:conclu[ií]d[oa]|finalizad[oa]|completed)"
    r"|pronto\s+para\s+produ[cç][aã]o|ready\s+for\s+production|successfully\s+(?:built|deployed|generated)"
    r"|deploy\s+(?:conclu[ií]do|realizado|efetuado)",
    re.IGNORECASE,
)

# Short, syntax-neutral placeholder: no quotes/backslashes/control characters,
# so it's safe to substitute inline inside a JSON string, YAML scalar, code
# string literal, or plain text without breaking the surrounding structure.
_SANITIZED_PLACEHOLDER = "[Reality Guard] instrucao removida"


@dataclass(frozen=True)
class RealityViolation:
    rule: str
    excerpt: str
    reason: str

    def as_dict(self) -> dict[str, str]:
        return {"rule": self.rule, "excerpt": self.excerpt, "reason": self.reason}


@dataclass
class GuardResult:
    violations: list[RealityViolation] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.violations

    def as_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "violations": [item.as_dict() for item in self.violations]}


class ExecutionRealityGuard:
    def validate(self, text: str, state: GroundTruthState, *, mode: Mode = "response") -> GuardResult:
        result = GuardResult()
        if not text:
            return result

        # 1. git clone: the generation pipeline never creates a remote repo, so
        # any clone URL is a fabrication until repo_status == CREATED. Applies
        # to BOTH modes — a README pointing at a nonexistent repository is a lie
        # shipped inside the product.
        if state.repo_status != "CREATED":
            for match in _GIT_CLONE_RE.finditer(text):
                result.violations.append(RealityViolation(
                    rule="git_clone_without_repo",
                    excerpt=match.group(0)[:120],
                    reason=f"Nenhum repositorio remoto existe (repo_status={state.repo_status}); a URL e inventada.",
                ))

        # 2. Invented success claims must never contradict the ground truth.
        if not state.ready:
            for match in _SUCCESS_CLAIM_RE.finditer(text):
                result.violations.append(RealityViolation(
                    rule="invented_success_claim",
                    excerpt=match.group(0)[:120],
                    reason=(
                        f"Afirmacao de sucesso contradiz o estado real (build={state.build_status}, "
                        f"pipeline={state.pipeline_status})."
                    ),
                ))

        # 3. Execution/deploy instructions.
        strict = mode == "response" or state.failure  # DIAGNOSTIC ONLY tightens artifacts too
        if strict:
            if state.docker_status != "READY":
                for match in _DOCKER_RE.finditer(text):
                    result.violations.append(RealityViolation(
                        rule="docker_without_ready_build",
                        excerpt=match.group(0)[:120],
                        reason=f"docker_status={state.docker_status}: o build nao esta aprovado; instrucao de execucao proibida.",
                    ))
            if not state.ready:
                for match in _DEPLOY_RE.finditer(text):
                    result.violations.append(RealityViolation(
                        rule="deploy_without_ready_pipeline",
                        excerpt=match.group(0)[:120],
                        reason=f"pipeline={state.pipeline_status}: instrucoes de deploy/producao exigem estado READY.",
                    ))
        elif not state.ready:
            # Artifact mode outside failure: deploy-to-production claims are
            # still blocked (they describe an action, not the product).
            for match in _DEPLOY_RE.finditer(text):
                result.violations.append(RealityViolation(
                    rule="deploy_without_ready_pipeline",
                    excerpt=match.group(0)[:120],
                    reason=f"pipeline={state.pipeline_status}: instrucoes de deploy/producao exigem estado READY.",
                ))

        return result

    def sanitize(self, text: str, state: GroundTruthState, *, mode: Mode = "response") -> tuple[str, GuardResult]:
        """Replace only the specific violating phrase in place (not the whole
        line) so the surrounding syntax of ANY file format -- JSON, YAML, code --
        stays structurally valid. A full-line markdown-style replacement used to
        corrupt real JSON files during generation (confirmed live: a translations
        file got a "> [Reality Guard] ..." line spliced into it, breaking JSON
        syntax and taking down every page of the generated app)."""
        result = self.validate(text, state, mode=mode)
        if result.ok:
            return text, result
        sanitized = text
        for violation in result.violations:
            if violation.excerpt and violation.excerpt in sanitized:
                sanitized = sanitized.replace(violation.excerpt, _SANITIZED_PLACEHOLDER)
        return sanitized, result

    def regeneration_directive(self, state: GroundTruthState, result: GuardResult) -> str:
        """Failure-aware prompting for the regeneration attempt after a rejected
        response: the model receives exactly which claims contradicted reality."""
        details = "\n".join(f"- {v.rule}: '{v.excerpt}' — {v.reason}" for v in result.violations[:8])
        return (
            "\n\n<reality_guard_rejection>\n"
            "Sua resposta anterior foi REJEITADA por contradizer o estado real do sistema:\n"
            f"{details}\n"
            "Gere novamente respeitando o <ground_truth_state>. Se o pipeline esta em falha, responda apenas com "
            "diagnostico, causa raiz e correcao — nunca instrucoes de execucao, clone ou deploy.\n"
            "</reality_guard_rejection>"
        )


execution_reality_guard = ExecutionRealityGuard()
