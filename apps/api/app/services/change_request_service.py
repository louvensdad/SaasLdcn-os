from __future__ import annotations

import hashlib
import json
import threading
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from app.engines.change_classification_engine import classify_change
from app.engines.change_impact_engine import analyze_impact
from app.engines.change_patch_engine import ChangePatchEngine
from app.repositories.change_request_repository import ChangeRequestRepository
from app.repositories.feature_repository import FeatureRepository
from app.schemas.change_request import CONSCIOUS_APPROVAL_PHRASE, ClassificationResult
from app.services.build_validation_service import BuildValidationService
from app.services.change_snapshot_service import ChangeSnapshotError, ChangeSnapshotService
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriteError, ProjectWriter
from app.services.runtime_functional_test_service import RuntimeFunctionalTestService

# Orchestrates the vault's Change Request lifecycle literally:
#   Draft -> Analyzed -> Planned -> Approved -> Applying -> Validating ->
#   Accepted ou Rejected -> Rolled Back.
# Mirrors ProjectRoomService's shape: one method per transition, a _fail()
# helper that records a diagnostic + raises before any state change, a
# history/operational-log audit trail. See Protocolo de alteracao incremental:
# "Falha restaura snapshot ou mantem a versao nao publicada."
#
# apply() also implements 47 - Conflitos/Resolucao de Conflitos.md's minimum
# bar ("nenhuma alteracao e perdida silenciosamente", "conflitos exibem
# origem, autor e impacto") via a per-project lock (see _project_lock) plus
# _describe_conflict(). Real semantic auto-merge is out of scope -- failing
# closed with a named origin already satisfies "merge automatico exige
# validacao" (no merge is attempted at all without one).

_NON_TERMINAL_STATUSES = ("Draft", "Analyzed", "Planned", "Approved", "Applying", "Validating")


class ChangeRequestError(ValueError):
    def __init__(
        self, message: str, *, current_status: str, expected_statuses: list[str], endpoint: str,
        reason: str, correction: str, checks: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.current_status = current_status
        self.expected_statuses = expected_statuses
        self.endpoint = endpoint
        self.reason = reason
        self.correction = correction
        self.checks = checks or []

    def diagnostic(self, http_status: int = 409) -> dict[str, Any]:
        return {
            "status_current": self.current_status,
            "status_expected": self.expected_statuses,
            "endpoint_called": self.endpoint,
            "http_status": http_status,
            "backend_message": str(self),
            "rejection_reason": self.reason,
            "correction": self.correction,
            "checks": self.checks,
        }


class ChangeRequestAccessError(ValueError):
    """Raised at create() when the target generated project cannot be resolved
    or does not belong to the requesting owner -- distinct from ChangeRequestError
    (which always has an existing CR record to attach a diagnostic to)."""


class ChangeRequestService:
    def __init__(
        self,
        repository: ChangeRequestRepository | None = None,
        *,
        patch_engine: ChangePatchEngine | None = None,
        snapshot_service: ChangeSnapshotService | None = None,
        build_service: BuildValidationService | None = None,
        preview_service: RuntimeFunctionalTestService | None = None,
        writer: ProjectWriter | None = None,
        files_service: GeneratedProjectService | None = None,
    ) -> None:
        self.repository = repository or ChangeRequestRepository()
        self.patch_engine = patch_engine or ChangePatchEngine()
        self.snapshot_service = snapshot_service or ChangeSnapshotService()
        self.build_service = build_service or BuildValidationService()
        self.preview_service = preview_service or RuntimeFunctionalTestService()
        self.writer = writer or ProjectWriter()
        self.files_service = files_service or GeneratedProjectService()
        # 47 - Conflitos/Resolucao de Conflitos.md: "Nenhuma alteracao e perdida
        # silenciosamente." The base_version check below catches the SEQUENTIAL
        # case (CR-B applies after CR-A already landed), but without a lock two
        # apply() calls racing on the same project could both pass that check
        # before either has written, then interleave writes -- a silent clobber
        # the hash check alone can't catch. One lock per project_id serializes
        # the check-through-write sequence instead of queuing/blocking requests:
        # a second concurrent apply() fails closed immediately.
        self._project_locks: dict[str, threading.Lock] = {}
        self._project_locks_guard = threading.Lock()

    def _project_lock(self, project_id: str) -> threading.Lock:
        with self._project_locks_guard:
            lock = self._project_locks.get(project_id)
            if lock is None:
                lock = threading.Lock()
                self._project_locks[project_id] = lock
            return lock

    # ------------------------------------------------------------------ read
    def get(self, change_request_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.get_for_owner(change_request_id, owner_user_id)

    def list_for_project(self, project_id: str, owner_user_id: str):
        return self.repository.list_for_project(project_id, owner_user_id)

    def list_for_owner(self, owner_user_id: str):
        return self.repository.list_for_owner(owner_user_id)

    def delete(self, change_request_id: str, owner_user_id: str) -> bool:
        return self.repository.delete_for_owner(change_request_id, owner_user_id)

    # ---------------------------------------------------------------- create
    def create(
        self,
        *,
        owner_user_id: str,
        project_id: str,
        intent: str,
        workspace_id: str | None = None,
        room_id: str | None = None,
        feature_id: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        project = self._project_dict(project_id)
        owner = self.writer.read_owner(project_id)
        if owner is not None and owner != owner_user_id:
            raise ChangeRequestAccessError("Generated project was not found.")
        try:
            self.files_service.list_files(project)
        except HTTPException as exc:
            raise ChangeRequestAccessError(str(exc.detail)) from exc
        if feature_id is not None:
            # vault 67 - Features: "Change Requests apontam para uma Feature ou
            # são marcados como manutenção" -- a feature_id must be real, owned
            # by the same caller, and scoped to the SAME project, not a
            # free-text label pointing nowhere (task_id stays unvalidated: no
            # Task entity exists yet, see feature.py's model docstring).
            feature = FeatureRepository().get_for_owner(feature_id, owner_user_id)
            if feature is None or feature["project_id"] != project_id:
                raise ChangeRequestAccessError(f"Feature '{feature_id}' was not found for this project.")

        cr = self.repository.create(
            owner_user_id=owner_user_id, project_id=project_id, intent=intent,
            workspace_id=workspace_id, room_id=room_id, feature_id=feature_id, task_id=task_id,
        )
        self._history(cr, "Change Request criado", source="api")
        self._log(cr, "POST", "/api/change-requests", 201, "success", "Change Request criado")
        return cr

    # ------------------------------------------------------------ transitions
    def analyze(
        self, change_request_id: str, owner_user_id: str, *,
        router: Any = None, api_key: str | None = None, user_model_choice: str | None = None, use_llm: bool = True,
    ) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/analyze"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Draft":
            self._fail(cr, endpoint=endpoint, expected=["Draft"], message="Analise so e permitida a partir de Draft.", reason=f"status atual: {cr['status']}", correction="Crie um novo Change Request ou verifique o estado atual.")

        classification = classify_change(cr["intent"], router=router, api_key=api_key, user_model_choice=user_model_choice, use_llm=use_llm, project_id=cr["project_id"])
        updated = self.repository.set_classification(change_request_id, owner_user_id, classification.model_dump())
        self._history(updated, "Change Request classificado", source="Change Classification Engine", metadata={"category": classification.category})
        self._log(updated, "POST", endpoint, 200, "success", "Classificado")
        return updated

    def plan(
        self, change_request_id: str, owner_user_id: str, *,
        router: Any = None, api_key: str | None = None, user_model_choice: str | None = None, use_llm: bool = True,
    ) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/plan"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Analyzed":
            self._fail(cr, endpoint=endpoint, expected=["Analyzed"], message="Planejamento so e permitido a partir de Analyzed.", reason=f"status atual: {cr['status']}", correction="Execute /analyze primeiro.")

        classification = ClassificationResult.model_validate(cr["classification"])
        project = self._project_dict(cr["project_id"])
        impact = analyze_impact(project, cr["intent"], classification, router=router, api_key=api_key, user_model_choice=user_model_choice, use_llm=use_llm, project_id=cr["project_id"])

        if not impact.affected_files:
            self._fail(cr, endpoint=endpoint, expected=["Analyzed"], message="Nao foi possivel determinar o escopo desta alteracao.", reason=impact.summary or "impact.affected_files vazio.", correction="Configure um provedor de IA (chave), ou revise o pedido para ser mais especifico.")
        if classification.category == "visual_only" and impact.requires_backend_change:
            self._fail(cr, endpoint=endpoint, expected=["Analyzed"], message="Alteracao classificada como visual, mas o impacto indica mudanca de backend -- isso nao e permitido sem justificativa.", reason="visual_only combinado com requires_backend_change=True.", correction="Revise a classificacao ou o pedido antes de planejar novamente.")

        base_version = self._hash_scope(project, impact.affected_files)
        updated = self.repository.set_scope_and_impact(
            change_request_id, owner_user_id, impact.affected_files, impact.model_dump(), base_version=base_version,
        )
        self._history(updated, "Escopo e impacto definidos", source="Change Impact Engine", metadata={"files": len(impact.affected_files)})
        self._log(updated, "POST", endpoint, 200, "success", "Planejado")
        return updated

    def approve(self, change_request_id: str, owner_user_id: str, confirmation: str) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/approve"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Planned":
            self._fail(cr, endpoint=endpoint, expected=["Planned"], message="Aprovacao so e permitida a partir de Planned.", reason=f"status atual: {cr['status']}", correction="Execute /plan primeiro.")
        if (confirmation or "").strip() != CONSCIOUS_APPROVAL_PHRASE:
            self._fail(cr, endpoint=endpoint, expected=["Planned"], message=f'Confirmacao invalida. Digite exatamente: "{CONSCIOUS_APPROVAL_PHRASE}".', reason="Frase de confirmacao incorreta.", correction=f'Digite exatamente "{CONSCIOUS_APPROVAL_PHRASE}" para aprovar.')

        approval = {"status": "approved", "approved_by": owner_user_id, "approved_at": self._now()}
        updated = self.repository.set_approval(change_request_id, owner_user_id, approval)
        self._history(updated, "Change Request aprovado", source="api")
        self._log(updated, "POST", endpoint, 200, "success", "Aprovado")
        return updated

    def apply(
        self, change_request_id: str, owner_user_id: str, *,
        router: Any = None, api_key: str | None = None, user_model_choice: str | None = None,
    ) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/apply"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Approved":
            self._fail(cr, endpoint=endpoint, expected=["Approved"], message="Aplicacao so e permitida a partir de Approved.", reason=f"status atual: {cr['status']}", correction="Execute /approve primeiro.")

        project = self._project_dict(cr["project_id"])
        scope = list(cr["scope"])

        lock = self._project_lock(cr["project_id"])
        if not lock.acquire(blocking=False):
            self._fail(cr, endpoint=endpoint, expected=["Approved"], message="Outra alteracao esta sendo aplicada neste projeto agora.", reason="concurrent apply() in progress for this project_id.", correction="Aguarde a alteracao em andamento terminar e tente novamente.")
        try:
            current_hash = self._hash_scope(project, scope)
            if current_hash != cr.get("base_version"):
                self._fail(cr, endpoint=endpoint, expected=["Approved"], message="A versao base mudou desde o planejamento (outro patch pode ter alterado estes arquivos).", reason=f"base_version drift detected at apply(). {self._describe_conflict(cr, scope)}", correction="Reinicie o ciclo (analyze -> plan -> approve) para recapturar o estado atual do projeto.")

            try:
                snapshot = self.snapshot_service.capture(project, scope)
            except ChangeSnapshotError as exc:
                self._fail(cr, endpoint=endpoint, expected=["Approved"], message=str(exc), reason="snapshot capture failed", correction="Reduza o escopo ou corrija os arquivos problematicos antes de tentar novamente.")
            cr = self.repository.set_snapshot(change_request_id, owner_user_id, snapshot, status="Applying")

            patch_result = self.patch_engine.generate_patch(
                cr["intent"], scope, snapshot, router=router, user_model_choice=user_model_choice, api_key=api_key,
                project_id=cr["project_id"],
            )

            if patch_result.rejected_out_of_scope:
                self._reject(cr, endpoint=endpoint, reason=f"Arquivos fora do escopo foram propostos e rejeitados (protegidos): {', '.join(patch_result.rejected_out_of_scope)}.")
                return None  # unreachable -- _reject always raises
            if not patch_result.accepted_files:
                self._reject(cr, endpoint=endpoint, reason="O agente nao retornou nenhum arquivo dentro do escopo.")
                return None  # unreachable -- _reject always raises

            try:
                self.writer.append(cr["project_id"], patch_result.accepted_files)
            except ProjectWriteError as exc:
                self._reject(cr, endpoint=endpoint, reason=f"Falha ao escrever o patch: {exc}", restore_snapshot=True, snapshot=snapshot)
                return None  # unreachable -- _reject always raises

            diff_dicts = [item.model_dump() for item in patch_result.diffs]
            cr = self.repository.set_diff(change_request_id, owner_user_id, diff_dicts, status="Applying")

            build_report = self.build_service.validate(project)
            cr = self.repository.set_build_result(change_request_id, owner_user_id, build_report.model_dump())

            if not build_report.ok:
                self._reject(cr, endpoint=endpoint, reason="A build falhou apos o patch.", restore_snapshot=True, snapshot=snapshot)
                return None  # unreachable -- _reject always raises

            preview_report = self.preview_service.run(project)
            cr = self.repository.set_preview_result(change_request_id, owner_user_id, preview_report.model_dump(), status="Validating")

            self._history(cr, "Patch aplicado; build e preview concluidos", source="Change Request Engine")
            self._log(cr, "POST", endpoint, 200, "success", "Patch aplicado, aguardando aceite")
            return cr
        finally:
            lock.release()

    def accept(self, change_request_id: str, owner_user_id: str) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/accept"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Validating":
            self._fail(cr, endpoint=endpoint, expected=["Validating"], message="Aceite so e permitido a partir de Validating.", reason=f"status atual: {cr['status']}", correction="Execute /apply primeiro.")

        result = {"outcome": "accepted", "reason": "", "recorded_at": self._now()}
        updated = self.repository.set_result(change_request_id, owner_user_id, result, status="Accepted")
        self._history(updated, "Change Request aceito", source="api")
        self._log(updated, "POST", endpoint, 200, "success", "Aceito")
        return updated

    def reject(self, change_request_id: str, owner_user_id: str, reason: str) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/reject"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] not in _NON_TERMINAL_STATUSES:
            self._fail(cr, endpoint=endpoint, expected=list(_NON_TERMINAL_STATUSES), message="Change Request ja esta em estado terminal.", reason=f"status atual: {cr['status']}", correction="Crie um novo Change Request.")

        note = ""
        if cr.get("snapshot") and cr["status"] in ("Applying", "Validating"):
            try:
                self.snapshot_service.restore(cr["project_id"], cr["snapshot"], writer=self.writer)
                note = " Snapshot restaurado."
            except ChangeSnapshotError as exc:
                note = f" ATENCAO: restauracao do snapshot falhou: {exc}"

        result = {"outcome": "rejected", "reason": f"{reason}{note}", "recorded_at": self._now()}
        updated = self.repository.set_result(change_request_id, owner_user_id, result, status="Rejected")
        self._history(updated, "Change Request rejeitado", source="api", metadata={"reason": reason})
        self._log(updated, "POST", endpoint, 200, "success", "Rejeitado")
        return updated

    def rollback(self, change_request_id: str, owner_user_id: str, reason: str) -> dict[str, Any] | None:
        endpoint = f"/api/change-requests/{change_request_id}/rollback"
        cr = self.get(change_request_id, owner_user_id)
        if cr is None:
            return None
        if cr["status"] != "Accepted":
            self._fail(cr, endpoint=endpoint, expected=["Accepted"], message="Rollback explicito so e permitido a partir de Accepted.", reason=f"status atual: {cr['status']}", correction="Alteracoes ainda nao aceitas sao revertidas via /reject.")

        snapshot = cr.get("snapshot")
        if not snapshot:
            self._fail(cr, endpoint=endpoint, expected=["Accepted"], message="Nao ha snapshot para restaurar.", reason="snapshot ausente", correction="Este Change Request nao pode ser revertido automaticamente.")
        try:
            self.snapshot_service.restore(cr["project_id"], snapshot, writer=self.writer)
        except ChangeSnapshotError as exc:
            self._fail(cr, endpoint=endpoint, expected=["Accepted"], message=f"Falha ao restaurar snapshot: {exc}", reason=str(exc), correction="Restaure manualmente ou tente novamente.")

        result = {"outcome": "rolled_back", "reason": reason, "recorded_at": self._now()}
        updated = self.repository.set_result(change_request_id, owner_user_id, result, status="Rolled Back")
        self._history(updated, "Change Request revertido", source="api", metadata={"reason": reason})
        self._log(updated, "POST", endpoint, 200, "success", "Revertido")
        return updated

    # --------------------------------------------------------------- internal
    def _project_dict(self, project_id: str) -> dict[str, Any]:
        return {"project_id": project_id, "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id)}

    def _hash_scope(self, project: dict[str, Any], scope: list[str]) -> str:
        snapshot = self.snapshot_service.capture(project, scope)
        canonical = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _describe_conflict(self, cr: dict[str, Any], scope: list[str]) -> str:
        """47 - Conflitos: 'Conflitos exibem origem, autor e impacto.' Names the
        other Change Request whose already-applied scope overlaps this one's,
        instead of just saying 'something changed'."""
        scope_set = set(scope)
        candidates = [
            other for other in self.repository.list_for_project(cr["project_id"], cr["owner_user_id"])
            if other["change_request_id"] != cr["change_request_id"]
            and other["status"] in ("Accepted", "Applying", "Validating")
            and scope_set & set(other.get("scope") or [])
        ]
        if not candidates:
            return "Nao foi possivel identificar qual alteracao causou a divergencia."
        latest = max(candidates, key=lambda other: other["updated_at"])
        overlap = sorted(scope_set & set(latest.get("scope") or []))
        return (
            f"Origem provavel: Change Request {latest['change_request_id']} "
            f"({latest['intent'][:80]!r}), status {latest['status']}, atualizado em {latest['updated_at']}, "
            f"arquivos sobrepostos: {', '.join(overlap)}."
        )

    def _reject(
        self, cr: dict[str, Any], *, endpoint: str, reason: str,
        restore_snapshot: bool = False, snapshot: dict[str, str | None] | None = None,
    ) -> None:
        note = ""
        if restore_snapshot and snapshot:
            try:
                self.snapshot_service.restore(cr["project_id"], snapshot, writer=self.writer)
                note = " Snapshot restaurado."
            except ChangeSnapshotError as exc:
                note = f" ATENCAO: restauracao do snapshot falhou: {exc}"
        full_reason = f"{reason}{note}"
        result = {"outcome": "rejected", "reason": full_reason, "recorded_at": self._now()}
        self.repository.set_result(cr["change_request_id"], cr["owner_user_id"], result, status="Rejected")
        diagnostic = {
            "status_current": "Rejected", "status_expected": ["Accepted"], "endpoint_called": endpoint,
            "http_status": 409, "backend_message": full_reason, "rejection_reason": full_reason,
            "correction": "Revise o pedido/escopo e crie um novo Change Request.", "checks": [],
        }
        self.repository.set_last_failure(cr["change_request_id"], cr["owner_user_id"], diagnostic)
        self.repository.append_operation(cr["change_request_id"], cr["owner_user_id"], {
            "id": f"op_{uuid4().hex[:10]}", "timestamp": self._now(), "method": "POST", "endpoint": endpoint,
            "http_status": 409, "status": "failed", "message": full_reason, "detail": None,
        })
        raise ChangeRequestError(
            full_reason, current_status="Rejected", expected_statuses=["Accepted"], endpoint=endpoint,
            reason=full_reason, correction="Revise o pedido/escopo e crie um novo Change Request.",
        )

    def _fail(
        self, cr: dict[str, Any], *, endpoint: str, expected: list[str], message: str, reason: str,
        correction: str, checks: list[dict[str, Any]] | None = None,
    ) -> None:
        diagnostic = {
            "status_current": cr["status"], "status_expected": expected, "endpoint_called": endpoint,
            "http_status": 409, "backend_message": message, "rejection_reason": reason,
            "correction": correction, "checks": checks or [],
        }
        self.repository.set_last_failure(cr["change_request_id"], cr["owner_user_id"], diagnostic)
        self._log(cr, "POST", endpoint, 409, "failed", message, detail=reason)
        raise ChangeRequestError(
            message, current_status=cr["status"], expected_statuses=expected, endpoint=endpoint,
            reason=reason, correction=correction, checks=diagnostic["checks"],
        )

    def _history(self, cr: dict[str, Any], event: str, *, source: str, metadata: dict[str, Any] | None = None) -> None:
        # Every call site here is a successful transition -- clear any stale
        # diagnostic from a prior failed attempt so the UI never shows a
        # rejection reason for a step the Change Request has since passed.
        # `cr` was read before this call, so the DB write alone isn't enough --
        # the caller's dict (returned straight to the HTTP response) needs the
        # same clear or it would still serialize the stale last_failure.
        self.repository.set_last_failure(cr["change_request_id"], cr["owner_user_id"], None)
        cr["last_failure"] = None
        self.repository.append_history(cr["change_request_id"], cr["owner_user_id"], {
            "id": f"hist_{uuid4().hex[:10]}", "event": event, "actor": cr["owner_user_id"],
            "source": source, "created_at": self._now(), "metadata": metadata or {},
        })

    def _log(self, cr: dict[str, Any], method: str | None, endpoint: str | None, http_status: int | None, status: str, message: str, *, detail: str | None = None) -> None:
        self.repository.append_operation(cr["change_request_id"], cr["owner_user_id"], {
            "id": f"op_{uuid4().hex[:10]}", "timestamp": self._now(), "method": method, "endpoint": endpoint,
            "http_status": http_status, "status": status, "message": message, "detail": detail,
        })

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
