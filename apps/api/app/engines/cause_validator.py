from __future__ import annotations

import re
from typing import Any, Callable

from app.engines.architecture_analysis import pick_canonical
from app.schemas.pipeline_recovery import CauseClassification, CauseValidation, RootCauseAnalysis
from app.services.artifact_security import SecretFinding, classify_secret_findings

# Agent 2 of the diagnosis team: confirm or reject Agent 1's leading
# hypothesis with direct evidence -- read-only, same as RootCauseInvestigator.
# `read_artifact` is injected so this engine never hard-codes a filesystem
# layout: in production it reads the job's checkpoint content
# (generated-projects/jobs/<id>/...), in tests it reads an in-memory fixture.

ArtifactReader = Callable[[str], "str | None"]

_SECRET_BLOCK_RE = re.compile(r"Artifact '([^']+)' blocked: ([^.]+)\.")

# Maps the six-way secret classifier verdict onto the four-way cause
# classification the recovery report is specified to use. SUSPICIOUS is
# deliberately NOT collapsed into FALSE_POSITIVE: it is a real ambiguity, not
# a confirmed non-issue, so it stays UNSAFE_TEMPLATE and keeps requiring
# approval.
_SECRET_CLASSIFICATION_TO_CAUSE: dict[str, CauseClassification] = {
    "REAL_SECRET": "REAL_SECRET",
    "SUSPICIOUS": "UNSAFE_TEMPLATE",
    "PLACEHOLDER": "FALSE_POSITIVE",
    "TEST_FIXTURE": "FALSE_POSITIVE",
    "DOCUMENTATION_EXAMPLE": "FALSE_POSITIVE",
    "SAFE_REFERENCE": "FALSE_POSITIVE",
}


class CauseValidatorEngine:
    def validate(
        self, analysis: RootCauseAnalysis, job: dict[str, Any], *, read_artifact: ArtifactReader,
    ) -> CauseValidation:
        secret_match = _SECRET_BLOCK_RE.search(analysis.visibleError)
        if secret_match:
            return self._validate_secret_block(analysis, secret_match.group(1), read_artifact=read_artifact)

        # Duplicate-basename / competing-root evidence dominates when there is
        # no secret block to validate.
        duplicate_lines = [line for line in analysis.evidence if "different paths" in line]
        if duplicate_lines:
            all_duplicate_paths = [p for p in analysis.affectedArtifacts]
            canonical = pick_canonical(all_duplicate_paths) if all_duplicate_paths else ""
            return CauseValidation(
                confirmed=True,
                classification="GENERATION_CONFLICT",
                triggeringContent="; ".join(duplicate_lines),
                triggeringRule="duplicate_basename_detection",
                canonicalArtifact=canonical,
                duplicateArtifacts=[p for p in all_duplicate_paths if p != canonical],
                safeCorrectionStrategy=(
                    "Requires the Architecture Consolidation Gate to pick one canonical root and drop "
                    "the rejected alternatives; not safe to auto-resolve without that gate."
                ),
                regressionRisk="Medium: dropping the wrong duplicate would remove real generated code.",
                requiresApproval=True,
            )

        return CauseValidation(
            confirmed=False,
            classification="UNKNOWN",
            safeCorrectionStrategy="No confirmed root cause; route to NEEDS_USER_ACTION for manual review.",
            regressionRisk="Unknown.",
            requiresApproval=True,
        )

    def _validate_secret_block(
        self, analysis: RootCauseAnalysis, blocked_path: str, *, read_artifact: ArtifactReader,
    ) -> CauseValidation:
        content = read_artifact(blocked_path)
        if content is None:
            return CauseValidation(
                confirmed=False,
                classification="UNKNOWN",
                triggeringContent="",
                triggeringRule="",
                canonicalArtifact=blocked_path,
                safeCorrectionStrategy=f"Could not read '{blocked_path}' from checkpoint storage to reproduce the block.",
                regressionRisk="Unknown -- content unavailable.",
                requiresApproval=True,
            )

        findings: list[SecretFinding] = classify_secret_findings(blocked_path, content)
        blocking = [f for f in findings if f.blocking]
        if not blocking:
            # The scanner (as currently deployed) no longer blocks this
            # content -- confirms a scanner false positive existed and has
            # since been corrected at the source (see artifact_security.py).
            return CauseValidation(
                confirmed=True,
                classification="FALSE_POSITIVE",
                triggeringContent=findings[0].redacted_value if findings else "",
                triggeringRule=findings[0].rule if findings else "no finding under the current classifier",
                canonicalArtifact=blocked_path,
                duplicateArtifacts=[],
                safeCorrectionStrategy="Re-run the write with the corrected classifier; no content change required.",
                regressionRisk="Low: the corrected classifier is narrower, not disabled -- known real-secret formats still block unconditionally.",
                requiresApproval=False,
            )

        worst = max(blocking, key=lambda f: {"REAL_SECRET": 2, "SUSPICIOUS": 1}.get(f.classification, 0))
        cause = _SECRET_CLASSIFICATION_TO_CAUSE[worst.classification]
        if cause == "REAL_SECRET":
            strategy = (
                f"Replace the literal value at {blocked_path}:{worst.line} ({worst.key}) with an "
                "environment-variable reference; the credential itself must be treated as compromised "
                "and rotated/revoked out-of-band -- this repair cannot safely do that automatically."
            )
            risk = "High: a real credential was generated into source; rotation is a human/ops action."
        else:  # UNSAFE_TEMPLATE (SUSPICIOUS)
            strategy = (
                f"Cannot confirm whether {blocked_path}:{worst.line} ({worst.key}) is a real secret or an "
                "unusually-shaped placeholder from content alone -- needs human confirmation before repair."
            )
            risk = "Medium: ambiguous value; wrong auto-classification in either direction has real cost."

        return CauseValidation(
            confirmed=True,
            classification=cause,
            triggeringContent=worst.redacted_value,
            triggeringRule=f"{worst.rule}:{worst.classification}",
            canonicalArtifact=blocked_path,
            duplicateArtifacts=[],
            safeCorrectionStrategy=strategy,
            regressionRisk=risk,
            requiresApproval=True,
        )


cause_validator = CauseValidatorEngine()
