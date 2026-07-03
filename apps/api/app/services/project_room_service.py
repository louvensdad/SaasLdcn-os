from __future__ import annotations

import json
import hashlib
import threading
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from app.engines.architect_engine import build_blueprint
from app.engines.architecture_model_engine import build_architecture_model
from app.engines.engineering_review_engine import build_engineering_review
from app.engines.orchestrator_engine import run_orchestrator
from app.engines.prompt_master_md_engine import author_prompt_master_md
from app.repositories.project_room_repository import ProjectRoomRepository
from app.schemas.architecture_blueprint import relevant_areas
from app.schemas.orchestrator import ProjectSpec

# The exact phrase a user must type to consciously accept a degraded (deterministic)
# preview and let it pass Engineering Review. Locale-independent on purpose: an
# explicit, auditable acknowledgement, mirroring the Meta-Factory's "LIBERAR COM RISCO".
CONSCIOUS_PREVIEW_PHRASE = "CONTINUAR COM PREVIEW"

TERMINAL_META_STATUSES = {"WAITING_META_FACTORY", "META_FACTORY_RUNNING", "GENERATING", "VALIDATING", "READY"}
ENGINEERING_APPROVED_STATUSES = {"ENGINEERING_APPROVED", *TERMINAL_META_STATUSES}
PROMPT_APPROVED_STATUSES = {"PROMPT_APPROVED", "BLUEPRINT_GENERATING", "BLUEPRINT_READY", "ENGINEERING_REVIEW", *ENGINEERING_APPROVED_STATUSES}


class ProjectRoomError(ValueError):
    def __init__(self, message: str, *, current_status: str, expected_statuses: list[str], endpoint: str, reason: str, correction: str, checks: list[dict[str, Any]] | None = None) -> None:
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


class ProjectRoomImportError(ValueError):
    pass


class ProjectRoomService:
    def __init__(self, repository: ProjectRoomRepository | None = None) -> None:
        self.repository = repository or ProjectRoomRepository()
        self._cancelled_blueprints: set[tuple[str, str]] = set()
        self._cancel_lock = threading.RLock()

    def list_rooms(self, owner_user_id: str) -> list[dict[str, Any]]:
        return [self._decorate(room) for room in self.repository.list_for_owner(owner_user_id)]

    def get_room(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self.repository.get_for_owner(room_id, owner_user_id)
        return self._decorate(room) if room else None

    def create_room(self, *, owner_user_id: str, title: str, raw_intent: str = "", locale: str = "pt-BR", api_key: str | None = None, user_model_choice: str | None = None, workspace_id: str | None = None, delivery_type: str = "web", preferred_language: str = "") -> dict[str, Any]:
        room = self.repository.create(owner_user_id=owner_user_id, title=title, locale=locale, raw_intent=raw_intent, workspace_id=workspace_id, delivery_type=delivery_type, preferred_language=preferred_language)
        self._log(room["room_id"], owner_user_id, "POST", "/api/project-rooms", 201, "success", "Project Room criado")
        if raw_intent.strip():
            return self._orchestrator_turn(room["room_id"], owner_user_id, raw_intent, api_key=api_key, user_model_choice=user_model_choice, status="UNDER_REVIEW")
        return self._decorate(room)

    def post_message(self, room_id: str, owner_user_id: str, content: str, *, api_key: str | None = None, user_model_choice: str | None = None) -> dict[str, Any] | None:
        room = self.repository.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        return self._orchestrator_turn(room_id, owner_user_id, content, api_key=api_key, user_model_choice=user_model_choice, status="UNDER_REVIEW")

    def generate_prompt(self, room_id: str, owner_user_id: str, *, api_key: str | None = None, user_model_choice: str | None = None) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if not room.get("spec"):
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/generate-prompt", expected=["UNDER_REVIEW"], message="Descreva sua ideia na sala antes de gerar o PromptMaster.md.", reason="ProjectSpec ausente.", correction="Envie uma mensagem com a ideia do projeto e aguarde o backend montar a spec.")
        return self._build_and_store_prompt(room, owner_user_id, api_key=api_key, user_model_choice=user_model_choice)

    def revise_prompt(self, room_id: str, owner_user_id: str, adjustment: str, *, api_key: str | None = None, user_model_choice: str | None = None) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if not room.get("prompt_master_versions"):
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/revise-prompt", expected=["PROMPT_READY"], message="Gere o PromptMaster.md uma primeira vez antes de solicitar ajustes.", reason="Nenhuma versao do PromptMaster existe.", correction="Execute Gerar PromptMaster antes de revisar.")
        self._orchestrator_turn(room_id, owner_user_id, adjustment, api_key=api_key, user_model_choice=user_model_choice, status="UNDER_REVIEW")
        refreshed = self._get_normalized(room_id, owner_user_id)
        return self._build_and_store_prompt(refreshed, owner_user_id, api_key=api_key, user_model_choice=user_model_choice)

    def generate_blueprint(self, room_id: str, owner_user_id: str, *, api_key: str | None = None, user_model_choice: str | None = None) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if room["status"] not in {"PROMPT_APPROVED", "BLUEPRINT_READY", "ENGINEERING_REVIEW", "ENGINEERING_APPROVED"}:
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/blueprint", expected=["PROMPT_APPROVED"], message="Aprove o PromptMaster.md antes de gerar o Blueprint arquitetural.", reason="PromptMaster ainda nao foi aprovado oficialmente.", correction="Aprove o PromptMaster na Project Room e tente novamente.")
        spec = ProjectSpec.model_validate(room["spec"])
        with self._cancel_lock:
            self._cancelled_blueprints.discard((room_id, owner_user_id))
        versions = list(room.get("blueprint_versions") or [])
        if room.get("architecture_blueprint") and not versions:
            versions.append(self._blueprint_version(
                room["architecture_blueprint"], owner_user_id, 1,
                prompt=room.get("prompt_master_md") or "",
                base_version=None,
                metadata={"migrated": True},
            ))
            self.repository.replace_blueprint_versions(
                room_id, owner_user_id, versions, 1, room["architecture_blueprint"]
            )
        base_version = max((item["version"] for item in versions), default=0) or None
        self.repository.update_status(room_id, owner_user_id, "BLUEPRINT_GENERATING")
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint", None, "running", "Provider detectado", detail=user_model_choice or getattr(api_key, "model", None) or "Modo Offline")
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint", None, "running", "PromptMaster enviado ao Architect")
        try:
            blueprint = build_blueprint(spec, project_id=room_id, api_key=api_key, user_model_choice=user_model_choice)
        except Exception as exc:
            previous_status = "BLUEPRINT_READY" if room.get("architecture_blueprint") else "PROMPT_APPROVED"
            self.repository.update_status(room_id, owner_user_id, previous_status)
            diagnostic = ProjectRoomError(
                "A geracao LLM falhou e nenhum fallback deterministico foi salvo.",
                current_status=previous_status,
                expected_statuses=["BLUEPRINT_READY"],
                endpoint=f"/api/project-rooms/{room_id}/blueprint",
                reason=str(exc),
                correction="Verifique a conexao do provider e tente Regenerar Blueprint com IA novamente.",
            )
            self.repository.set_last_failure(room_id, owner_user_id, diagnostic.diagnostic(502))
            self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint", 502, "failed", "Falha do provider; Blueprint anterior preservado", detail=str(exc))
            raise
        with self._cancel_lock:
            cancelled = (room_id, owner_user_id) in self._cancelled_blueprints
            self._cancelled_blueprints.discard((room_id, owner_user_id))
        if cancelled:
            previous_status = "BLUEPRINT_READY" if room.get("architecture_blueprint") else "PROMPT_APPROVED"
            self.repository.update_status(room_id, owner_user_id, previous_status)
            self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint/cancel", 200, "rollback", "Geracao cancelada; versao anterior preservada")
            raise ProjectRoomError("Geracao do Blueprint cancelada pelo usuario.", current_status=previous_status, expected_statuses=[previous_status], endpoint=f"/api/project-rooms/{room_id}/blueprint", reason="Cancelamento solicitado durante a resposta do provider.", correction="Inicie uma nova geracao quando desejar.")
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint", None, "running", "Resposta recebida", detail=f"{len(blueprint.decisions)} decisoes")
        self._log(room_id, owner_user_id, None, None, None, "success", "Trade-offs concluidos")
        self._log(room_id, owner_user_id, None, None, None, "success", "Riscos e seguranca validados")
        blueprint_dict = blueprint.model_dump(mode="json")
        version_number = max((item["version"] for item in versions), default=0) + 1
        version = self._blueprint_version(
            blueprint_dict, owner_user_id, version_number,
            prompt=room.get("prompt_master_md") or "",
            base_version=base_version,
        )
        version["blueprint"]["version"] = version_number
        self.repository.add_blueprint_version(room_id, owner_user_id, version)
        self.repository.set_last_failure(room_id, owner_user_id, None)
        self.repository.append_message(room_id, owner_user_id, self._assistant_message(f"Blueprint arquitetural gerado ({len(blueprint.decisions)} decisoes justificadas)." + (" [Preview Deterministico]" if blueprint.degraded else " [LLM]"), degraded=blueprint.degraded))
        self._history(room_id, owner_user_id, "Blueprint criado", source=blueprint.providerLabel, metadata={"mode": blueprint.mode, "model": blueprint.model, "fallback": blueprint.fallback, "version": version_number})
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint", 200, "success", "Blueprint salvo")
        return self.get_room(room_id, owner_user_id)

    def cancel_blueprint_generation(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if room["status"] == "BLUEPRINT_GENERATING":
            with self._cancel_lock:
                self._cancelled_blueprints.add((room_id, owner_user_id))
            self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/blueprint/cancel", 202, "running", "Cancelamento solicitado")
        return self.get_room(room_id, owner_user_id)

    def restore_blueprint_version(self, room_id: str, owner_user_id: str, version: int) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        versions = list(room.get("blueprint_versions") or [])
        selected = next((item for item in versions if item["version"] == version), None)
        if selected is None:
            raise ProjectRoomError("Versao de Blueprint nao encontrada.", current_status=room["status"], expected_statuses=[room["status"]], endpoint=f"/api/project-rooms/{room_id}/blueprints/{version}/restore", reason="A versao solicitada nao existe.", correction="Atualize o historico e escolha uma versao disponivel.")
        self.repository.replace_blueprint_versions(room_id, owner_user_id, versions, version, selected["blueprint"])
        self._history(room_id, owner_user_id, "Blueprint restaurado", source="Workflow Controller", metadata={"version": version})
        return self.get_room(room_id, owner_user_id)

    def duplicate_blueprint_version(self, room_id: str, owner_user_id: str, version: int) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        versions = list(room.get("blueprint_versions") or [])
        selected = next((item for item in versions if item["version"] == version), None)
        if selected is None:
            return self.restore_blueprint_version(room_id, owner_user_id, version)
        next_version = max((item["version"] for item in versions), default=0) + 1
        duplicate = self._blueprint_version(selected["blueprint"], owner_user_id, next_version, prompt=selected.get("prompt") or "", base_version=version, metadata={"duplicated_from": version})
        self.repository.add_blueprint_version(room_id, owner_user_id, duplicate)
        self._history(room_id, owner_user_id, "Blueprint duplicado", source="Workflow Controller", metadata={"version": next_version, "base_version": version})
        return self.get_room(room_id, owner_user_id)

    def delete_blueprint_version(self, room_id: str, owner_user_id: str, version: int) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        versions = [item for item in (room.get("blueprint_versions") or []) if item["version"] != version]
        if not versions:
            raise ProjectRoomError("O projeto precisa manter ao menos uma versao do Blueprint.", current_status=room["status"], expected_statuses=[room["status"]], endpoint=f"/api/project-rooms/{room_id}/blueprints/{version}", reason="Tentativa de excluir a unica versao.", correction="Duplique ou gere uma nova versao antes de excluir esta.")
        active = next((item for item in versions if item["version"] == room.get("active_blueprint_version")), versions[-1])
        self.repository.replace_blueprint_versions(room_id, owner_user_id, versions, active["version"], active["blueprint"])
        self._history(room_id, owner_user_id, "Blueprint excluido", source="Workflow Controller", metadata={"version": version})
        return self.get_room(room_id, owner_user_id)

    def start_engineering_review(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if room["status"] in ENGINEERING_APPROVED_STATUSES:
            return self._decorate(room)
        if room["status"] not in {"BLUEPRINT_READY", "ENGINEERING_REVIEW"}:
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/engineering-review", expected=["BLUEPRINT_READY"], message="Gere o Blueprint arquitetural antes de abrir o Engineering Review Center.", reason="Blueprint nao esta pronto para revisao.", correction="Abra o Architect Engine e gere o Blueprint.")
        if not room.get("architecture_blueprint"):
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/engineering-review", expected=["BLUEPRINT_READY"], message="O Engineering Review Center exige um Blueprint arquitetural salvo.", reason="architecture_blueprint ausente no registro.", correction="Regere o Blueprint no Architect Engine.")
        if room["status"] == "ENGINEERING_REVIEW":
            return self._decorate(room)
        self.repository.append_message(room_id, owner_user_id, self._assistant_message("Engineering Review Center aberto. Revise e aprove a arquitetura antes da Meta-Fabrica."), status="ENGINEERING_REVIEW")
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/engineering-review", 200, "success", "Engineering Review aberto")
        return self.get_room(room_id, owner_user_id)

    def validate_engineering_review(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self.get_room(room_id, owner_user_id)
        if room is None:
            return None
        blueprint = room.get("architecture_blueprint") or {}
        readiness = room.get("readiness_checklist") or []
        degraded = bool(blueprint.get("degraded"))
        provider_valid = (
            blueprint.get("mode") == "deterministic" and degraded and blueprint.get("provider") is None
        ) or (
            blueprint.get("mode") == "llm" and not degraded and bool(blueprint.get("provider")) and blueprint.get("source") == "llm"
        )
        checks = [
            {"id": "prompt_master", "label": "PromptMaster", "passed": bool(room.get("prompt_master_md")), "detail": "PromptMaster aprovado." if room.get("prompt_master_md") else "PromptMaster ausente."},
            {"id": "blueprint", "label": "Blueprint ativo", "passed": bool(blueprint), "detail": f"Blueprint v{blueprint.get('version') or room.get('active_blueprint_version') or 1}." if blueprint else "Blueprint ausente."},
            {"id": "provider", "label": "Provider e modo", "passed": provider_valid, "detail": f"{blueprint.get('providerLabel') or 'Nenhum'} · {blueprint.get('mode') or 'indefinido'} · degraded={str(degraded).lower()}"},
            {"id": "decisions", "label": "Decisoes arquiteturais", "passed": bool(blueprint.get("decisions")), "detail": f"{len(blueprint.get('decisions') or [])} decisoes persistidas."},
            {"id": "readiness", "label": "Checklist de readiness", "passed": not any(item.get("required") and item.get("status") != "passed" and item.get("id") != "engineering_review" for item in readiness), "detail": "Sem bloqueios anteriores a aprovacao."},
        ]
        blockers = [item["detail"] for item in checks if not item["passed"]]
        valid = not blockers
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/engineering-review/validate", 200, "success" if valid else "failed", "Engineering Review validada" if valid else "Engineering Review bloqueada", detail="; ".join(blockers) or "Todos os checks passaram")
        return {
            "valid": valid,
            "status_current": room["status"],
            "status_expected": ["ENGINEERING_REVIEW", "ENGINEERING_APPROVED"],
            "active_blueprint_version": blueprint.get("version") or room.get("active_blueprint_version") or 1,
            "provider": blueprint.get("provider"),
            "providerLabel": blueprint.get("providerLabel") or "Nenhum",
            "model": blueprint.get("model") or "Motor deterministico",
            "mode": blueprint.get("mode") or "deterministic",
            "degraded": degraded,
            "checks": checks,
            "blockers": blockers,
            "recommended_action": "Aprovar Review" if valid and room["status"] != "ENGINEERING_APPROVED" else "Enviar para Meta-Fabrica" if valid else "Corrigir os bloqueios indicados",
            "room": self.get_room(room_id, owner_user_id),
        }

    def approve(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if room["status"] == "PROMPT_READY":
            self.repository.append_message(room_id, owner_user_id, self._assistant_message("PromptMaster.md aprovado. Proxima etapa: Architect Engine."), status="PROMPT_APPROVED")
            self._history(room_id, owner_user_id, "Prompt aprovado", source="Project Room")
            self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/approve", 200, "success", "PromptMaster aprovado")
            return self.get_room(room_id, owner_user_id)
        if room["status"] == "ENGINEERING_REVIEW" and room.get("architecture_blueprint"):
            blueprint = room["architecture_blueprint"]
            if blueprint.get("degraded") and not blueprint.get("preview_acknowledged"):
                self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/approve", expected=["ENGINEERING_REVIEW"], message="O Blueprint esta em modo deterministico (preview). Regenere com IA ou confirme conscientemente o preview antes de aprovar.", reason="Blueprint degradado sem reconhecimento explicito do preview.", correction=f'Regenere o Blueprint com IA, ou confirme digitando "{CONSCIOUS_PREVIEW_PHRASE}" para continuar mesmo assim.')
            self.repository.append_message(room_id, owner_user_id, self._assistant_message("Engineering Review aprovado. Meta-Fabrica liberada para este projeto."), status="ENGINEERING_APPROVED")
            self._history(room_id, owner_user_id, "Review aprovada", source="Engine")
            self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/approve", 200, "success", "Engineering Review aprovado")
            return self.get_room(room_id, owner_user_id)
        self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/approve", expected=["PROMPT_READY", "ENGINEERING_REVIEW"], message="Aprovacao permitida somente para PromptMaster pronto ou Engineering Review aberto.", reason="Status atual nao aceita aprovacao.", correction="Siga a proxima acao oficial indicada no workflow do projeto.")

    def acknowledge_preview(self, room_id: str, owner_user_id: str, confirmation: str) -> dict[str, Any] | None:
        """Conscious 'continuar com preview': record that the user explicitly accepts a
        degraded (deterministic) Blueprint. Auditable in history + operational log.
        Idempotent and a no-op marker for already-AI blueprints."""
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        blueprint = room.get("architecture_blueprint")
        if not blueprint:
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/acknowledge-preview", expected=["BLUEPRINT_READY", "ENGINEERING_REVIEW"], message="Nao ha Blueprint para reconhecer.", reason="architecture_blueprint ausente.", correction="Gere o Blueprint no Architect Engine primeiro.")
        if (confirmation or "").strip() != CONSCIOUS_PREVIEW_PHRASE:
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/acknowledge-preview", expected=[room["status"]], message=f'Confirmacao invalida. Digite exatamente: "{CONSCIOUS_PREVIEW_PHRASE}".', reason="Frase de confirmacao incorreta.", correction=f'Digite exatamente "{CONSCIOUS_PREVIEW_PHRASE}" para continuar em modo deterministico.')
        updated = {**blueprint, "preview_acknowledged": True}
        self.repository.set_blueprint(room_id, owner_user_id, updated)
        self.repository.append_message(room_id, owner_user_id, self._assistant_message("Preview deterministico aceito conscientemente. Engineering Review pode ser aprovada.", degraded=True))
        self._history(room_id, owner_user_id, "Continuacao em modo deterministico", source="Project Room", metadata={"confirmation": CONSCIOUS_PREVIEW_PHRASE})
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/acknowledge-preview", 200, "success", "Preview deterministico reconhecido")
        return self.get_room(room_id, owner_user_id)

    def send_to_generator(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        checks = self._readiness_checks(room)
        failed = [check for check in checks if check["required"] and check["status"] != "passed"]
        if room["status"] in TERMINAL_META_STATUSES:
            return self._decorate(room)
        if room["status"] != "ENGINEERING_APPROVED" or failed:
            reason = "; ".join(check["label"] for check in failed) or "Engineering Review nao aprovada."
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/send-to-generator", expected=["ENGINEERING_APPROVED"], message="A Meta-Fabrica exige Blueprint revisado e Engineering Review aprovado.", reason=reason, correction="Corrija os itens com falha no checklist oficial e aprove a Engineering Review.", checks=checks)
        job = self._new_job(room)
        self.repository.save_handoff(room_id, owner_user_id, job, status="WAITING_META_FACTORY")
        self.repository.set_last_failure(room_id, owner_user_id, None)
        self.repository.append_message(room_id, owner_user_id, self._assistant_message(job["message"]))
        self._history(room_id, owner_user_id, "Enviado Meta-Fabrica", source="Project Room")
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/send-to-generator", 200, "success", "Projeto enviado para Meta-Fabrica")
        return self.get_room(room_id, owner_user_id)

    def mark_generated(self, room_id: str, owner_user_id: str, generated_project_id: str) -> dict[str, Any] | None:
        room = self._get_normalized(room_id, owner_user_id)
        if room is None:
            return None
        if room["status"] not in TERMINAL_META_STATUSES or not room.get("architecture_blueprint"):
            self._fail(room, owner_user_id, endpoint=f"/api/project-rooms/{room_id}/mark-generated", expected=["WAITING_META_FACTORY", "META_FACTORY_RUNNING", "GENERATING", "VALIDATING"], message="O projeto precisa ter Engineering Review aprovado antes de marcar como gerado.", reason="Handoff para Meta-Fabrica ainda nao existe ou Blueprint ausente.", correction="Envie o projeto para a Meta-Fabrica antes de iniciar a geracao.")
        job = room.get("generation_handoff") or self._new_job(room)
        job = {**job, "status": "generated", "generated_project_id": generated_project_id}
        self.repository.save_handoff(room_id, owner_user_id, job, status="READY")
        self.repository.append_message(room_id, owner_user_id, self._assistant_message(f"Projeto gerado com sucesso ({generated_project_id})."))
        self._history(room_id, owner_user_id, "Projeto gerado", source="Meta-Fabrica", metadata={"generated_project_id": generated_project_id})
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/mark-generated", 200, "success", "Projeto marcado como pronto")
        return self.get_room(room_id, owner_user_id)

    def archive(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self.repository.update_status(room_id, owner_user_id, "ARCHIVED")
        return self._decorate(room) if room else None

    def import_prompt_master(self, *, owner_user_id: str, fmt: str, content: str, title: str, locale: str = "pt-BR", api_key: str | None = None, user_model_choice: str | None = None, workspace_id: str | None = None) -> dict[str, Any]:
        text = (content or "").strip()
        if not text:
            raise ProjectRoomImportError("O conteudo importado esta vazio.")
        if fmt == "json":
            try:
                parsed = json.loads(text)
                spec = ProjectSpec.model_validate(parsed)
            except (json.JSONDecodeError, ValidationError) as exc:
                raise ProjectRoomImportError("JSON invalido para um ProjectSpec. Verifique o conteudo importado.") from exc
            document = author_prompt_master_md(spec, version=1, api_key=api_key, user_model_choice=user_model_choice)
            degraded = bool(document.get("degraded"))
        else:
            result = run_orchestrator(text, [], api_key=api_key, user_model_choice=user_model_choice)
            spec = result.spec
            degraded = result.degraded
            document = {"markdown": text, "sections": [], "version": 1, "engine_version": "import", "generated_at": self._now(), "degraded": degraded, "project_name": title}
        room = self.repository.create(owner_user_id=owner_user_id, title=title, locale=locale, raw_intent=spec.raw_intent, workspace_id=workspace_id)
        room_id = room["room_id"]
        self.repository.set_spec(room_id, owner_user_id, spec.model_dump(mode="json"), confidence=spec.confidence, degraded=degraded)
        self.repository.add_prompt_master_version(room_id, owner_user_id, document, status="PROMPT_APPROVED")
        self.repository.append_message(room_id, owner_user_id, {"role": "system", "content": "PromptMaster importado e aprovado.", "degraded": degraded})
        self._history(room_id, owner_user_id, "Prompt aprovado", source="Import")
        self._log(room_id, owner_user_id, "POST", "/api/project-rooms/import", 201, "success", "PromptMaster importado")
        return self.get_room(room_id, owner_user_id)

    def _fail(self, room: dict[str, Any], owner_user_id: str, *, endpoint: str, expected: list[str], message: str, reason: str, correction: str, checks: list[dict[str, Any]] | None = None) -> None:
        diagnostic = {"status_current": room["status"], "status_expected": expected, "endpoint_called": endpoint, "http_status": 409, "backend_message": message, "rejection_reason": reason, "correction": correction, "checks": checks or self._readiness_checks(room)}
        self.repository.set_last_failure(room["room_id"], owner_user_id, diagnostic)
        self._log(room["room_id"], owner_user_id, "POST", endpoint, 409, "failed", message, detail=reason)
        self._log(room["room_id"], owner_user_id, None, None, None, "rollback", "Rollback executado", detail="Nenhuma mudanca de estado foi persistida.")
        raise ProjectRoomError(message, current_status=room["status"], expected_statuses=expected, endpoint=endpoint, reason=reason, correction=correction, checks=diagnostic["checks"])

    def _get_normalized(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        room = self.repository.get_for_owner(room_id, owner_user_id)
        return self._normalize_status(room) if room else None

    def _normalize_status(self, room: dict[str, Any]) -> dict[str, Any]:
        status = room.get("status")
        normalized = status
        if status == "APPROVED":
            normalized = "ENGINEERING_APPROVED" if room.get("architecture_blueprint") else "PROMPT_APPROVED"
        elif status == "SENT_TO_GENERATOR":
            normalized = "WAITING_META_FACTORY"
        elif status == "GENERATED":
            normalized = "READY"
        return {**room, "status": normalized} if normalized != status else room

    def _decorate(self, room: dict[str, Any] | None) -> dict[str, Any]:
        if room is None:
            return None
        room = self._normalize_status(room)
        versions = list(room.get("blueprint_versions") or [])
        for record in versions:
            if record.get("blueprint"):
                record["blueprint"] = self._normalize_blueprint_metadata(record["blueprint"], version=int(record.get("version") or 1))
                record["provider"] = record["blueprint"].get("provider")
                record["providerLabel"] = record["blueprint"].get("providerLabel") or "Nenhum"
        active_version = room.get("active_blueprint_version")
        active_record = next((item for item in versions if item.get("version") == active_version), None)
        if active_record is None and versions:
            active_record = max(versions, key=lambda item: int(item.get("version") or 0))
            active_version = int(active_record.get("version") or 1)
            room = {**room, "active_blueprint_version": active_version}
        active_blueprint = (active_record or {}).get("blueprint") or room.get("architecture_blueprint")
        if active_blueprint:
            active_blueprint = self._normalize_blueprint_metadata(active_blueprint, version=active_version or (active_record or {}).get("version") or 1)
            room = {**room, "architecture_blueprint": active_blueprint}
            if active_record:
                active_record["blueprint"] = active_blueprint
            room["blueprint_versions"] = versions
        checks = self._readiness_checks(room)
        blocking = [check["detail"] for check in checks if check["required"] and check["status"] != "passed"]
        return {**room, "readiness_checklist": checks, "engineering_review": build_engineering_review(room, checks), "architecture_model": build_architecture_model(room), "workflow": self._workflow(room, checks, blocking), "history": room.get("history") or [], "operational_log": room.get("operational_log") or [], "last_failure": room.get("last_failure")}

    def _workflow(self, room: dict[str, Any], checks: list[dict[str, Any]], blocking: list[str]) -> dict[str, Any]:
        status = room["status"]
        progress = {"DRAFT": 0, "UNDER_REVIEW": 8, "PROMPT_READY": 18, "PROMPT_APPROVED": 28, "BLUEPRINT_GENERATING": 38, "BLUEPRINT_READY": 52, "ENGINEERING_REVIEW": 66, "ENGINEERING_APPROVED": 78, "WAITING_META_FACTORY": 86, "META_FACTORY_RUNNING": 90, "GENERATING": 94, "VALIDATING": 97, "READY": 100, "FAILED": 100, "ARCHIVED": 0}
        primary = {"DRAFT": "collect_intent", "UNDER_REVIEW": "generate_prompt", "PROMPT_READY": "approve_prompt", "PROMPT_APPROVED": "open_architect", "BLUEPRINT_GENERATING": "wait_blueprint", "BLUEPRINT_READY": "open_engineering_review", "ENGINEERING_REVIEW": "approve_engineering_review", "ENGINEERING_APPROVED": "send_to_meta_factory", "WAITING_META_FACTORY": "open_meta_factory", "META_FACTORY_RUNNING": "watch_generation", "GENERATING": "watch_generation", "VALIDATING": "watch_validation", "READY": "open_project", "FAILED": "run_diagnostic"}.get(status)
        expected = {"DRAFT": ["UNDER_REVIEW"], "UNDER_REVIEW": ["PROMPT_READY"], "PROMPT_READY": ["PROMPT_APPROVED"], "PROMPT_APPROVED": ["BLUEPRINT_READY"], "BLUEPRINT_READY": ["ENGINEERING_REVIEW"], "ENGINEERING_REVIEW": ["ENGINEERING_APPROVED"], "ENGINEERING_APPROVED": ["WAITING_META_FACTORY"], "WAITING_META_FACTORY": ["META_FACTORY_RUNNING", "GENERATING", "READY"]}.get(status, [])
        return {"status": status, "status_label": status.replace("_", " ").title(), "progress": progress.get(status, 0), "primary_action": primary, "can_send_to_meta_factory": status == "ENGINEERING_APPROVED" and not blocking, "blocking_reasons": blocking, "expected_next_statuses": expected}

    def _readiness_checks(self, room: dict[str, Any]) -> list[dict[str, Any]]:
        spec = room.get("spec") or {}
        blueprint = room.get("architecture_blueprint") or {}
        decisions = blueprint.get("decisions") or []
        areas = {d.get("area") for d in decisions if isinstance(d, dict)}
        stack = spec.get("suggested_stack") or {}
        prompt_ok = bool(room.get("prompt_master_md")) and room["status"] in (PROMPT_APPROVED_STATUSES | {"PROMPT_READY"})
        engineering_ok = room["status"] in ENGINEERING_APPROVED_STATUSES
        nf = spec.get("non_functional") or {}
        decided_count = len({a for a in areas if a})
        # "mobile" only counts toward this project's total when its delivery_type
        # actually includes it -- otherwise a web-only project could never show
        # 100% architecture readiness (see relevant_areas / Mobile Factory Phase 2).
        total_relevant_areas = len(relevant_areas(spec.get("delivery_type")))
        architecture_threshold = max(1, total_relevant_areas - 2)  # matches the original 8-of-10 ratio
        def check(id_: str, label: str, passed: bool, detail_ok: str, detail_fail: str, *, required: bool = True) -> dict[str, Any]:
            return {"id": id_, "label": label, "status": "passed" if passed else "failed", "detail": detail_ok if passed else detail_fail, "required": required}
        return [
            check("prompt_master", "PromptMaster", prompt_ok, "PromptMaster existe e foi aprovado.", "PromptMaster precisa estar gerado e aprovado."),
            check("blueprint", "Blueprint", bool(blueprint and decisions), "Blueprint arquitetural salvo.", "Blueprint arquitetural ausente."),
            check("engineering_review", "Review", engineering_ok, "Engineering Review aprovada.", "Engineering Review ainda nao foi aprovada."),
            check("consistency", "Consistencia", bool(spec and blueprint and blueprint.get("project_id") == room.get("room_id")), "Spec e Blueprint pertencem ao mesmo projeto.", "Spec/Blueprint inconsistentes ou incompletos."),
            check("dependencies", "Dependencias", "integrations" in areas and "apis" in areas, "Integracoes e APIs foram decididas.", "Dependencias/API ainda nao foram explicitadas no Blueprint."),
            check("security", "Seguranca", {"auth", "authorization"} <= areas, "Autenticacao e autorizacao revisadas.", "Autenticacao/autorizacao precisam de decisao arquitetural."),
            check("contract", "Contrato", "apis" in areas and bool(room.get("prompt_master_md")), "Contrato API/PromptMaster disponivel.", "Contrato de API ou PromptMaster ausente."),
            check("documentation", "Documentacao", bool(room.get("prompt_master_versions")), "Documentacao PromptMaster versionada.", "Documentacao versionada ausente."),
            check("build", "Build", "deploy" in areas, "Plano de build/deploy definido.", "Plano de build/deploy ausente."),
            check("tests", "Testes", "tests" in areas, "Estrategia de testes definida.", "Estrategia de testes ausente."),
            check("stack", "Stack", bool(stack or "backend" in areas), "Stack principal definida.", "Stack principal ausente."),
            # Advisory checks (required=False): enrich the Readiness Center without
            # changing the send gate (which only blocks on required checks).
            check("architecture", "Arquitetura", decided_count >= architecture_threshold, f"{decided_count}/{total_relevant_areas} areas arquiteturais decididas.", f"Apenas {decided_count}/{total_relevant_areas} areas decididas.", required=False),
            check("performance", "Performance", ("observability" in areas) or bool(nf.get("performance")), "Sinais de performance presentes.", "Sem evidencia de performance (advisory).", required=False),
            check("scalability", "Escalabilidade", ("deploy" in areas) or bool(nf.get("scalability")), "Estrategia de escala definida.", "Sem evidencia de escalabilidade (advisory).", required=False),
            check("observability", "Observabilidade", "observability" in areas, "Observabilidade definida.", "Observabilidade ausente (advisory).", required=False),
            check("quality", "Qualidade", ("tests" in areas) and ("backend" in areas), "Qualidade: testes + backend em camadas.", "Qualidade incompleta (advisory).", required=False),
        ]

    def _new_job(self, room: dict[str, Any]) -> dict[str, Any]:
        versions = room.get("prompt_master_versions") or []
        latest = versions[-1] if versions else {}
        return {"handoff_id": f"handoff_{uuid4().hex[:12]}", "status": "queued", "project_id": room["room_id"], "workspace_id": room.get("workspace_id"), "prompt_master_version": int(latest.get("version", len(versions))), "project_name": latest.get("project_name") or room.get("title"), "generated_project_id": None, "message": "Projeto enviado para a Meta-Fabrica. Abra a geracao para produzir o projeto.", "created_at": self._now()}

    def _orchestrator_turn(self, room_id: str, owner_user_id: str, content: str, *, api_key: str | None, user_model_choice: str | None, status: str) -> dict[str, Any]:
        room = self.repository.get_for_owner(room_id, owner_user_id)
        prior_user_texts = [m["content"] for m in room["messages"] if m["role"] == "user"]
        all_texts = [*prior_user_texts, content]
        raw_intent = room.get("raw_intent") or all_texts[0]
        prior_answers = [{"id": f"refine_{index}", "answer": text} for index, text in enumerate(all_texts[1:], start=1)]
        # preferred_language, like delivery_type, is a room-level USER decision:
        # the orchestrator is told about it in the prompt and the resulting spec
        # is deterministically enforced (run_orchestrator/enforce_preferred_language),
        # so the model can never override the user's stack choice.
        result = run_orchestrator(raw_intent, prior_answers, api_key=api_key, user_model_choice=user_model_choice, preferred_language=room.get("preferred_language") or None)
        spec_dict = result.spec.model_dump(mode="json")
        # delivery_type is a room-level decision made at creation time, not
        # something the orchestrator infers from free text -- always carry the
        # room's value into the compiled spec, overriding the schema default.
        spec_dict["delivery_type"] = room.get("delivery_type", "web")
        self.repository.append_message(room_id, owner_user_id, {"role": "user", "content": content})
        self.repository.set_spec(room_id, owner_user_id, spec_dict, confidence=result.spec.confidence, degraded=result.degraded, status=status)
        self.repository.append_message(room_id, owner_user_id, self._assistant_message(self._summary(result.spec, result.degraded), degraded=result.degraded))
        self._log(room_id, owner_user_id, "POST", f"/api/project-rooms/{room_id}/message", 200, "success", "Spec atualizada pelo Orchestrator")
        return self.get_room(room_id, owner_user_id)

    def _build_and_store_prompt(self, room: dict[str, Any], owner_user_id: str, *, api_key: str | None = None, user_model_choice: str | None = None) -> dict[str, Any]:
        spec = ProjectSpec.model_validate(room["spec"])
        version = len(room.get("prompt_master_versions") or []) + 1
        document = author_prompt_master_md(spec, version=version, api_key=api_key, user_model_choice=user_model_choice)
        degraded = bool(document.get("degraded"))
        self.repository.add_prompt_master_version(room["room_id"], owner_user_id, document, status="PROMPT_READY")
        self.repository.append_message(room["room_id"], owner_user_id, self._assistant_message(f"PromptMaster.md gerado (versao {version})" + (" pela IA." if not degraded else " em Modo Deterministico."), degraded=degraded))
        self._log(room["room_id"], owner_user_id, "POST", f"/api/project-rooms/{room['room_id']}/generate-prompt", 200, "success", "PromptMaster gerado")
        return self.get_room(room["room_id"], owner_user_id)

    def _history(self, room_id: str, owner_user_id: str, event: str, *, source: str, metadata: dict[str, str | int | float | bool | None] | None = None) -> None:
        self.repository.append_history(room_id, owner_user_id, {"id": f"hist_{uuid4().hex[:10]}", "event": event, "actor": owner_user_id, "source": source, "created_at": self._now(), "metadata": metadata or {}})

    def _blueprint_version(self, blueprint: dict[str, Any], owner_user_id: str, version: int, *, prompt: str, base_version: int | None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        blueprint = self._normalize_blueprint_metadata(blueprint, version=version)
        canonical = json.dumps(blueprint, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return {
            "id": f"bpv_{uuid4().hex[:12]}",
            "version": version,
            "blueprint": blueprint,
            "provider": blueprint.get("provider"),
            "providerLabel": blueprint.get("providerLabel") or "Nenhum",
            "model": blueprint.get("model") or blueprint.get("llm_model"),
            "generated_at": blueprint.get("generated_at") or self._now(),
            "generation_time_ms": int(blueprint.get("generation_time_ms") or 0),
            "tokens": blueprint.get("tokens") or {},
            "user": owner_user_id,
            "score": round(float(blueprint.get("confidence") or 0) * 100),
            "hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            "prompt": prompt,
            "base_version": base_version,
            "metadata": metadata or {},
        }

    @staticmethod
    def _normalize_blueprint_metadata(blueprint: dict[str, Any], *, version: int) -> dict[str, Any]:
        normalized = dict(blueprint)
        raw_mode = str(normalized.get("mode") or "").lower()
        raw_source = str(normalized.get("source") or normalized.get("origin") or "").lower()
        degraded = bool(normalized.get("degraded", raw_mode not in {"llm"}))
        is_llm = not degraded and (raw_mode in {"llm"} or raw_source not in {"", "deterministic", "ldcn deterministic preview"})
        if is_llm:
            from app.services.llm_provider_registry import normalize_provider_id
            raw_provider = normalized.get("provider") or raw_source
            try:
                provider = normalize_provider_id(str(raw_provider))
            except (KeyError, ValueError):
                provider = str(raw_provider).lower() if raw_provider else None
            labels = {"anthropic": "Claude", "openai": "OpenAI", "google": "Gemini", "deepseek": "DeepSeek", "openrouter": "OpenRouter", "ollama": "Ollama", "custom": "Custom"}
            provider_label = normalized.get("providerLabel") or labels.get(provider or "", str(raw_provider or "LLM"))
            model = normalized.get("model") or normalized.get("llm_model") or "Modelo nao informado"
            mode = source = "llm"
        else:
            provider = None
            provider_label = "Nenhum"
            model = "Motor deterministico"
            mode = source = "deterministic"
            degraded = True
        generated_at = normalized.get("generatedAt") or normalized.get("generated_at") or ""
        tokens = normalized.get("tokens") or {}
        tokens_used = normalized.get("tokensUsed")
        if not isinstance(tokens_used, int):
            tokens_used = int(tokens.get("total") or (tokens.get("input", 0) + tokens.get("output", 0)))
        latency = int(normalized.get("latencyMs") or normalized.get("generation_time_ms") or 0)
        normalized.update({
            "degraded": degraded, "mode": mode, "provider": provider,
            "providerLabel": provider_label, "model": model, "source": source,
            "version": version, "generatedAt": generated_at, "tokensUsed": tokens_used,
            "latencyMs": latency, "generatedBy": normalized.get("generatedBy") or "architect_engine",
            "llmMetadata": normalized.get("llmMetadata") or {"provider": provider, "providerLabel": provider_label, "model": model, "servedByFallback": not is_llm},
            "llm_model": normalized.get("llm_model") or (model if is_llm else None),
            "fallback": not is_llm,
        })
        return normalized

    def _log(self, room_id: str, owner_user_id: str, method: str | None, endpoint: str | None, http_status: int | None, status: str, message: str, *, detail: str | None = None) -> None:
        self.repository.append_operation(room_id, owner_user_id, {"id": f"op_{uuid4().hex[:10]}", "timestamp": self._now(), "method": method, "endpoint": endpoint, "http_status": http_status, "status": status, "message": message, "detail": detail})

    def _summary(self, spec: ProjectSpec, degraded: bool) -> str:
        parts = ["Entendi sua ideia.", f"Resumo: {spec.product_summary or spec.raw_intent}.", f"Identifiquei {len(spec.target_users)} perfis de usuario, {len(spec.entities)} entidades e {len(spec.business_rules)} regras de negocio.", f"Confianca: {round(spec.confidence * 100)}%."]
        if spec.open_questions:
            questions = "; ".join(q.question for q in spec.open_questions)
            parts.append(f"Para refinar, preciso confirmar: {questions}")
        else:
            parts.append("Posso gerar o PromptMaster.md quando voce quiser.")
        if degraded:
            parts.append("(Modo Deterministico - nenhum LLM real disponivel nesta execucao.)")
        return " ".join(parts)

    def _assistant_message(self, content: str, *, degraded: bool = False) -> dict[str, Any]:
        return {"role": "assistant", "content": content, "degraded": degraded}

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
