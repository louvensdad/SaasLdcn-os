from __future__ import annotations

import re

from app.engines import architecture_analysis
from app.schemas.pipeline_recovery import CauseValidation, RepairChange, RepairReport
from app.services.artifact_security import artifact_block_reason, classify_secret_findings
from app.services.file_protocol import EmittedFile

# Agent 3 of the diagnosis team: the only one of the three allowed to mutate
# anything, and only after CauseValidator has confirmed the cause (and, when
# CauseValidation.requiresApproval is set, only after explicit approval was
# recorded by the caller -- this engine itself refuses otherwise, it never
# infers approval).


class RepairNotAuthorized(RuntimeError):
    """Raised when a repair is attempted without a confirmed cause or without
    the approval CauseValidation.requiresApproval demands. Never bypassed."""


# Deliberately contains a recognized placeholder token ("change-me") so the
# redacted content is self-evidently a placeholder to the very same
# classifier that flagged the original value -- not just "hopefully" safe.
_ROTATION_PLACEHOLDER = "change-me-rotate-required-credential"


def _redact_line(content: str, line_number: int, key: str) -> str:
    lines = content.splitlines(keepends=True)
    idx = line_number - 1
    if 0 <= idx < len(lines):
        original = lines[idx]
        # Preserve the assignment shape; replace only the credential-looking
        # literal so the file still parses -- matches the same
        # quote-preserving approach as artifact_security.sanitize_untrusted_source.
        replaced = re.sub(
            r'(["\']).*?\1', f'"{_ROTATION_PLACEHOLDER}"', original, count=1,
        )
        if replaced == original:
            replaced = f"{original.rstrip(chr(10))}  # {_ROTATION_PLACEHOLDER}\n"
        lines[idx] = replaced
    return "".join(lines)


class RepairEngineerEngine:
    def repair_secret_block(
        self, validation: CauseValidation, files: list[EmittedFile], *, approved: bool,
    ) -> tuple[list[EmittedFile], RepairReport]:
        if not validation.confirmed:
            raise RepairNotAuthorized("Cause was not confirmed by CauseValidator; refusing to repair.")
        if validation.requiresApproval and not approved:
            raise RepairNotAuthorized("CauseValidation requires explicit approval before RepairEngineer may act.")

        target_path = validation.canonicalArtifact
        changes: list[RepairChange] = []
        files_changed: list[str] = []
        remaining_risks: list[str] = []

        if validation.classification == "FALSE_POSITIVE":
            # No content mutation: the corrected classifier (see
            # artifact_security.py) already stopped blocking this content.
            # The "repair" is entirely at the scanner, applied once, globally
            # -- never a one-off bypass for this single artifact.
            changes.append(RepairChange(
                file=target_path, action="no_change_required",
                reason="Corrected secret classifier no longer flags this content; nothing to rewrite.",
            ))
            repaired_files = files
        elif validation.classification in {"REAL_SECRET", "UNSAFE_TEMPLATE"}:
            repaired_files = []
            found = False
            for file in files:
                if file.path.replace("\\", "/").strip("/") != target_path.replace("\\", "/").strip("/"):
                    repaired_files.append(file)
                    continue
                found = True
                findings = classify_secret_findings(target_path, file.content)
                blocking = [f for f in findings if f.blocking]
                new_content = file.content
                for finding in blocking:
                    new_content = _redact_line(new_content, finding.line, finding.key)
                    changes.append(RepairChange(
                        file=target_path, action="redact",
                        reason=f"Redacted {finding.classification} value at line {finding.line} ({finding.key}); real credential requires manual rotation.",
                    ))
                files_changed.append(target_path)
                repaired_files.append(EmittedFile(path=file.path, content=new_content))
            if not found:
                raise RepairNotAuthorized(f"Target artifact '{target_path}' was not found in the file set to repair.")
            if validation.classification == "REAL_SECRET":
                remaining_risks.append(
                    "A real credential was generated into source and has been redacted, not rotated. "
                    "The underlying credential must still be revoked/rotated out-of-band."
                )
            else:
                remaining_risks.append(
                    "Value could not be confirmed as placeholder or real secret; redacted fail-safe. "
                    "Confirm with the credential owner before assuming it was never live."
                )
        else:
            raise RepairNotAuthorized(f"No safe repair strategy defined for classification '{validation.classification}'.")

        tests_executed = ["artifact_security.artifact_block_reason"]
        tests_passed: list[str] = []
        tests_failed: list[str] = []
        for file in repaired_files:
            if file.path.replace("\\", "/").strip("/") != target_path.replace("\\", "/").strip("/"):
                continue
            reason = artifact_block_reason(target_path, file.content)
            if reason:
                tests_failed.append(f"artifact_block_reason('{target_path}') still blocks: {reason}")
            else:
                tests_passed.append(f"artifact_block_reason('{target_path}') no longer blocks")

        report = RepairReport(
            rootCause=validation.safeCorrectionStrategy,
            changes=changes,
            filesChanged=files_changed,
            testsExecuted=tests_executed,
            testsPassed=tests_passed,
            testsFailed=tests_failed,
            remainingRisks=remaining_risks,
        )
        return repaired_files, report

    def repair_generation_conflict(
        self, validation: CauseValidation, files: list[EmittedFile], *, approved: bool,
    ) -> tuple[list[EmittedFile], RepairReport]:
        """LDCN Multi-Agent Runtime, Phase 3 (real gap closed): drops the
        duplicate/competing artifacts CauseValidator already identified,
        keeping only the canonical one. `canonicalArtifact`/`duplicateArtifacts`
        are computed by CauseValidator via `architecture_analysis.pick_canonical`
        -- the SAME function ArchitectureConsolidationGate uses for write-time
        prevention, so this post-failure repair can never pick a different
        "canonical" file than the preventive gate would have. Same
        confirmed/requiresApproval authorization contract as
        repair_secret_block; refuses identically otherwise."""
        if not validation.confirmed:
            raise RepairNotAuthorized("Cause was not confirmed by CauseValidator; refusing to repair.")
        if validation.classification != "GENERATION_CONFLICT":
            raise RepairNotAuthorized(
                f"repair_generation_conflict only handles GENERATION_CONFLICT, got '{validation.classification}'."
            )
        if validation.requiresApproval and not approved:
            raise RepairNotAuthorized("CauseValidation requires explicit approval before RepairEngineer may act.")

        canonical = architecture_analysis.normalize(validation.canonicalArtifact).strip("/")
        duplicates = {architecture_analysis.normalize(path).strip("/") for path in validation.duplicateArtifacts}

        changes: list[RepairChange] = []
        files_changed: list[str] = []
        repaired_files: list[EmittedFile] = []
        for file in files:
            normalized = architecture_analysis.normalize(file.path).strip("/")
            if normalized in duplicates:
                changes.append(RepairChange(
                    file=file.path, action="delete",
                    reason=f"Duplicate of canonical artifact '{canonical}'; dropped to resolve the generation conflict.",
                ))
                files_changed.append(file.path)
                continue
            repaired_files.append(file)

        if not files_changed:
            raise RepairNotAuthorized(
                f"None of the duplicate artifacts {sorted(duplicates)} were found in the file set to repair."
            )

        # Regression self-check: re-run the exact detector this repair exists
        # to satisfy, over the REPAIRED set -- proves the conflict is
        # actually gone rather than assuming dropping the files was enough
        # (mirrors repair_secret_block's own artifact_block_reason re-check).
        remaining_duplicates = architecture_analysis.duplicate_basenames([f.path for f in repaired_files])
        canonical_basename = architecture_analysis.basename_of(canonical)
        tests_executed = ["architecture_analysis.duplicate_basenames"]
        tests_passed: list[str] = []
        tests_failed: list[str] = []
        if canonical_basename in remaining_duplicates:
            tests_failed.append(
                f"duplicate_basenames still reports '{canonical_basename}' as duplicated after repair: "
                f"{remaining_duplicates[canonical_basename]}"
            )
        else:
            tests_passed.append(f"duplicate_basenames no longer reports '{canonical_basename}' as duplicated")

        report = RepairReport(
            rootCause=validation.safeCorrectionStrategy,
            changes=changes,
            filesChanged=files_changed,
            testsExecuted=tests_executed,
            testsPassed=tests_passed,
            testsFailed=tests_failed,
            remainingRisks=[
                "Dropped duplicate artifact(s) are permanently excluded from this write attempt. If the "
                "canonical pick was wrong, the discarded implementation is not recoverable from this repair "
                "alone (it remains visible in earlier job checkpoints, not in the final package).",
            ],
        )
        return repaired_files, report


repair_engineer = RepairEngineerEngine()
