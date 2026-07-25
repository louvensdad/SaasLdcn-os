from __future__ import annotations

from typing import Any, Callable
from uuid import uuid4

from app.engines.cause_validator import cause_validator
from app.engines.repair_engineer import RepairNotAuthorized, repair_engineer
from app.engines.root_cause_investigator import root_cause_investigator
from app.schemas.pipeline_recovery import RecoveryEvent, RecoveryRun, RecoveryState
from app.services.file_protocol import EmittedFile

ArtifactReader = Callable[[str], "str | None"]

# PipelineRecoveryOrchestrator: PIPELINE_FAILED -> capture context -> Root
# Cause Investigator -> Cause Validator -> (approval gate) -> Repair Engineer
# -> regression -> resume. Deliberately dependency-free from
# GenerationJobEngine/the DB/notifications -- it returns a fully-populated
# RecoveryRun (with a RecoveryEvent per real state transition, timestamped,
# each optionally carrying a `notification_type` in .detail matching one of
# the ten PARTE 10 notification types) for the caller to forward through the
# existing _notify()/_emit() machinery. This keeps the orchestrator pure and
# independently testable, and keeps persistence exactly where every other
# engine in this codebase leaves it: with the caller. PIPELINE_RESUMED is
# deliberately NOT emitted here -- only the caller knows whether the retried
# write actually succeeded.

_MESSAGES: dict[RecoveryState, str] = {
    "DIAGNOSIS_QUEUED": "Diagnostico da falha enfileirado.",
    "ROOT_CAUSE_ANALYZING": "Analisando a origem da falha.",
    "CAUSE_VALIDATING": "A hipotese inicial esta sendo validada.",
    "WAITING_REPAIR_APPROVAL": "Correcao requer aprovacao antes de prosseguir.",
    "REPAIRING": "Aplicando a correcao.",
    "REGRESSION_TESTING": "Executando regressao apos a correcao.",
    "RESUMING": "Retomando a pipeline pelo ultimo checkpoint seguro.",
    "RECOVERED": "Pipeline recuperada com sucesso.",
    "RECOVERY_FAILED": "Recuperacao automatica nao foi possivel.",
}


class PipelineRecoveryOrchestrator:
    def __init__(self) -> None:
        self.root_cause_investigator = root_cause_investigator
        self.cause_validator = cause_validator
        self.repair_engineer = repair_engineer

    def _new_run(self, job_id: str, owner_user_id: str, now: str) -> RecoveryRun:
        return RecoveryRun(
            id=f"recov_{uuid4().hex[:12]}", jobId=job_id, ownerUserId=owner_user_id,
            state="DIAGNOSIS_QUEUED", createdAt=now, updatedAt=now,
        )

    def _transition(
        self, run: RecoveryRun, state: RecoveryState, now: str, *,
        message: str | None = None, level: str = "info", detail: dict[str, Any] | None = None,
        notification_type: str | None = None,
    ) -> None:
        run.state = state
        run.updatedAt = now
        event_detail = dict(detail or {})
        if notification_type:
            event_detail["notification_type"] = notification_type
        run.events.append(RecoveryEvent(
            id=f"revt_{uuid4().hex[:12]}", recoveryId=run.id, jobId=run.jobId, timestamp=now,
            state=state, message=message or _MESSAGES[state], level=level, detail=event_detail,
        ))

    def run_recovery(
        self,
        job: dict[str, Any],
        owner_user_id: str,
        *,
        files: list[EmittedFile],
        read_artifact: ArtifactReader,
        now: Callable[[], str],
        auto_approve: bool = False,
    ) -> tuple[RecoveryRun, list[EmittedFile]]:
        """Diagnose a real pipeline failure and, only when it is safe to do so
        without human approval, repair and return the (possibly modified)
        file set. Never mutates `files` in place -- returns a new list."""
        run = self._new_run(job.get("id", ""), owner_user_id, now())
        self._transition(run, "DIAGNOSIS_QUEUED", now(), notification_type="DIAGNOSIS_STARTED")

        self._transition(run, "ROOT_CAUSE_ANALYZING", now())
        analysis = self.root_cause_investigator.investigate(job)
        run.rootCauseAnalysis = analysis

        self._transition(
            run, "CAUSE_VALIDATING", now(),
            message=f"O arquivo/evidencia relacionado esta sendo inspecionado (causa provavel: {analysis.probableRootCause[:120]}).",
            notification_type="ROOT_CAUSE_FOUND",
        )
        validation = self.cause_validator.validate(analysis, job, read_artifact=read_artifact)
        run.causeValidation = validation

        if not validation.confirmed:
            self._transition(
                run, "RECOVERY_FAILED", now(), level="warning",
                message="Nao foi possivel confirmar a causa raiz com evidencia direta; requer revisao manual.",
                notification_type="RECOVERY_FAILED",
            )
            run.outcome = "RECOVERY_FAILED"
            run.outcomeMessage = "Cause not confirmed; manual review required."
            return run, files

        confirmed_messages = {
            "FALSE_POSITIVE": ("Foi confirmado um falso positivo do detector de segredos.", "info"),
            "REAL_SECRET": ("Foi confirmado um segredo real no artefato bloqueado.", "warning"),
            "UNSAFE_TEMPLATE": ("O valor permanece ambiguo mesmo apos inspecao direta.", "warning"),
            "GENERATION_CONFLICT": ("Foi confirmado um conflito de geracao (arquivos concorrentes/duplicados).", "warning"),
        }
        message, level = confirmed_messages.get(validation.classification, ("Causa confirmada.", "info"))
        self._transition(run, "CAUSE_VALIDATING", now(), message=message, level=level, notification_type="CAUSE_CONFIRMED")

        if validation.requiresApproval and not auto_approve:
            self._transition(run, "WAITING_REPAIR_APPROVAL", now(), level="warning")
            run.outcome = None
            run.outcomeMessage = "Waiting for explicit approval before repair may proceed."
            return run, files

        self._transition(
            run, "REPAIRING", now(), message="Corrigindo a origem do problema (classificador/artefato).",
            notification_type="REPAIR_STARTED",
        )
        try:
            # LDCN Multi-Agent Runtime, Phase 3 (real gap closed): dispatch
            # by confirmed classification rather than assuming every
            # confirmed cause is a secret block -- GENERATION_CONFLICT has
            # had its own real repair path (drop the duplicates, keep the
            # canonical) since repair_generation_conflict was added.
            if validation.classification == "GENERATION_CONFLICT":
                repaired_files, repair_report = self.repair_engineer.repair_generation_conflict(
                    validation, files, approved=True,
                )
            else:
                repaired_files, repair_report = self.repair_engineer.repair_secret_block(
                    validation, files, approved=True,
                )
        except RepairNotAuthorized as exc:
            self._transition(
                run, "RECOVERY_FAILED", now(), level="error", message=f"Reparo nao autorizado: {exc}",
                notification_type="RECOVERY_FAILED",
            )
            run.outcome = "RECOVERY_FAILED"
            run.outcomeMessage = str(exc)
            return run, files

        run.repairReport = repair_report

        self._transition(
            run, "REGRESSION_TESTING", now(), message="Executando regressao do detector apos a correcao.",
            notification_type="REPAIR_COMPLETED",
        )
        if repair_report.testsFailed:
            self._transition(
                run, "RECOVERY_FAILED", now(), level="error",
                message=f"Regressao falhou apos o reparo: {'; '.join(repair_report.testsFailed)}",
                notification_type="REGRESSION_FAILED",
            )
            run.outcome = "RECOVERY_FAILED"
            run.outcomeMessage = "Regression failed after repair."
            return run, repaired_files

        self._transition(
            run, "RESUMING", now(), message=f"Retomando a pipeline pelo checkpoint {analysis.firstDivergencePoint}.",
            notification_type="REGRESSION_PASSED",
        )
        repair_report.checkpointUsed = analysis.firstDivergencePoint
        repair_report.resumeResult = "pending_caller_resume"

        self._transition(run, "RECOVERED", now(), notification_type="PIPELINE_RECOVERED")
        run.outcome = "RECOVERED"
        run.outcomeMessage = "Repair applied, regression passed; pipeline may resume."
        return run, repaired_files


pipeline_recovery_orchestrator = PipelineRecoveryOrchestrator()
