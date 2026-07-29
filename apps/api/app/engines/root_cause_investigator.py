from __future__ import annotations

import re
from typing import Any

from app.engines import architecture_analysis
from app.schemas.pipeline_recovery import Hypothesis, RootCauseAnalysis

# Agent 1 of the diagnosis team (see app.engines.pipeline_recovery_orchestrator):
# locate the real origin of a pipeline failure. Read-only -- never mutates a
# job, a checkpoint, or a generated file. Everything it reports is derived
# from what already happened (job error, events, checkpoints, artifacts),
# never invented. Duplicate/competing-root detection is shared with
# ArchitectureConsolidationGate via app.engines.architecture_analysis so the
# two never disagree about what counts as a duplicate.

_SECRET_BLOCK_RE = re.compile(r"Artifact '([^']+)' blocked: ([^.]+)\.")
_TIMEOUT_RE = re.compile(r"timeout after (\d+) seconds", re.IGNORECASE)


def _generated_paths(artifacts: list[dict[str, Any]]) -> list[str]:
    return [a["name"] for a in artifacts if a.get("kind") == "generated" and a.get("name")]


def _last_successful_checkpoint(job: dict[str, Any]) -> str:
    error = job.get("error") or {}
    if error.get("last_successful_checkpoint"):
        return str(error["last_successful_checkpoint"])
    checkpoints = job.get("checkpoints") or []
    successes = [c for c in checkpoints if c.get("status") == "success"]
    if successes:
        return str(successes[-1]["stage"])
    return "PREPARING_CONTEXT"


class RootCauseInvestigatorEngine:
    def investigate(self, job: dict[str, Any]) -> RootCauseAnalysis:
        error: dict[str, Any] = job.get("error") or {}
        failed_stage = str(error.get("stage") or job.get("currentStage") or "")
        visible_error = str(error.get("message") or "")
        artifacts = job.get("artifacts") or []
        events = job.get("events") or []

        evidence: list[str] = []
        hypotheses: list[Hypothesis] = []
        affected_artifacts: list[str] = []
        recommended_inspection: list[str] = []

        secret_match = _SECRET_BLOCK_RE.search(visible_error)
        if secret_match:
            blocked_path, block_reason = secret_match.group(1), secret_match.group(2)
            affected_artifacts.append(blocked_path)
            evidence.append(f"visibleError names a blocked artifact: '{blocked_path}' ({block_reason})")
            hypotheses.append(Hypothesis(
                description=(
                    f"The artifact-security scanner blocked '{blocked_path}' during final write "
                    f"because of: {block_reason}. Need Cause Validator to confirm whether the "
                    "flagged content is a genuine credential, a placeholder, or a scanner false positive."
                ),
                confidence=0.9,
                evidence=[f"error.message contains the exact ArtifactSecurityError text: {visible_error!r}"],
            ))
            recommended_inspection.append(f"Read the raw pre-write content of '{blocked_path}' from the job's checkpoint artifacts")
            recommended_inspection.append("Run the current secret classifier against that exact content")

        timeout_match = _TIMEOUT_RE.search(visible_error)
        if timeout_match:
            evidence.append(f"visibleError reports a {timeout_match.group(1)}s timeout")
            hypotheses.append(Hypothesis(
                description=(
                    f"Stage '{failed_stage}' exceeded its execution budget "
                    f"({timeout_match.group(1)}s) -- most likely a hung external process "
                    "(build/install command) or a runaway agent call, not a code defect."
                ),
                confidence=0.75,
                evidence=[f"error.reason: {error.get('reason', '')}", f"error.elapsed_seconds: {error.get('elapsed_seconds', '')}"],
            ))
            recommended_inspection.append("Inspect the command log around the reported pid for a hang vs. a slow-but-progressing process")

        generated_paths = _generated_paths(artifacts)
        # Keyed by module-relative residual path (see architecture_analysis.
        # duplicate_basenames), not bare basename -- two different real
        # per-module files never appear here just for sharing a filename.
        duplicates = architecture_analysis.duplicate_basenames(generated_paths)
        if duplicates:
            for residual, paths in duplicates.items():
                evidence.append(f"'{residual}' was generated at {len(paths)} different paths: {paths}")
            affected_artifacts.extend(sorted({p for paths in duplicates.values() for p in paths}))
            hypotheses.append(Hypothesis(
                description=(
                    "Multiple pipeline stages/agents emitted competing implementations of the same "
                    "logical file at different paths, indicating architectural fragmentation "
                    "(no single canonical structure was enforced before the final write)."
                ),
                confidence=0.6 if not secret_match else 0.4,
                evidence=[f"{residual}: {paths}" for residual, paths in duplicates.items()],
            ))
            recommended_inspection.append("Run the architecture-conflict check across all generated backend artifacts before the next build")

        competing_roots = architecture_analysis.competing_backend_roots(generated_paths)
        if competing_roots:
            evidence.append(f"generated artifacts span multiple competing source roots: {competing_roots}")
            hypotheses.append(Hypothesis(
                description=(
                    f"Backend generation used {len(competing_roots)} different root layouts in the "
                    f"same job ({', '.join(competing_roots)}) instead of one canonical structure."
                ),
                confidence=0.55,
                evidence=[f"competing roots observed: {competing_roots}"],
            ))

        if not hypotheses:
            # Generic fallback: still evidence-based, never invented -- built
            # purely from what the job actually recorded.
            error_events = [e for e in events if e.get("level") == "error"]
            evidence.append(f"{len(error_events)} error-level execution events recorded before termination")
            hypotheses.append(Hypothesis(
                description=f"Unclassified failure at stage '{failed_stage}': {visible_error or 'no message recorded'}.",
                confidence=0.3,
                evidence=[e.get("message", "") for e in error_events[-3:]],
            ))
            recommended_inspection.append("Manual review required -- no known failure pattern matched")

        hypotheses.sort(key=lambda h: h.confidence, reverse=True)
        probable_root_cause = hypotheses[0].description if hypotheses else "Unknown"

        return RootCauseAnalysis(
            jobId=job.get("id", ""),
            failedStage=failed_stage,
            visibleError=visible_error,
            probableRootCause=probable_root_cause,
            firstDivergencePoint=_last_successful_checkpoint(job),
            affectedArtifacts=affected_artifacts,
            evidence=evidence,
            hypotheses=hypotheses,
            recommendedInspection=recommended_inspection,
        )


root_cause_investigator = RootCauseInvestigatorEngine()
