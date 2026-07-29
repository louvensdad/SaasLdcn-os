from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.engines.mission_artifact_engine import draft_artifact
from app.engines.mission_field_action_engine import execute_field_action
from app.registry.missions_registry import UnknownMissionTypeError, resolve_mission_summary
from app.repositories.mission_repository import MissionRepository


class MissionError(ValueError):
    """Mirrors ProjectRoomError's shape so the frontend's existing diagnostic
    rendering (endpoint/expected-status/correction) works unchanged."""

    def __init__(self, message: str, *, current_status: str, expected_statuses: list[str], endpoint: str, reason: str, correction: str) -> None:
        super().__init__(message)
        self.current_status = current_status
        self.expected_statuses = expected_statuses
        self.endpoint = endpoint
        self.reason = reason
        self.correction = correction

    def diagnostic(self, http_status: int = 409) -> dict[str, Any]:
        return {
            "status_current": self.current_status,
            "status_expected": self.expected_statuses,
            "endpoint_called": self.endpoint,
            "http_status": http_status,
            "backend_message": str(self),
            "rejection_reason": self.reason,
            "correction": self.correction,
        }


class MissionService:
    def __init__(self, repository: MissionRepository | None = None) -> None:
        self.repository = repository or MissionRepository()

    def list_missions(self, owner_user_id: str) -> list[dict[str, Any]]:
        return [self._decorate(mission) for mission in self.repository.list_for_owner(owner_user_id)]

    def get_mission(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        mission = self.repository.get_for_owner(mission_id, owner_user_id)
        return self._decorate(mission) if mission else None

    def create_mission(
        self,
        *,
        owner_user_id: str,
        mission_type: str,
        title: str = "",
        mode: str = "guided",
        experience_level: str = "intermediate",
        workspace_id: str | None = None,
    ) -> dict[str, Any]:
        try:
            summary = resolve_mission_summary(mission_type)
        except UnknownMissionTypeError as exc:
            raise MissionError(
                str(exc), current_status="active", expected_statuses=[], endpoint="/api/missions",
                reason="mission_type não existe no registry.", correction="Escolha um tipo de missão válido no seletor de missões.",
            ) from exc
        resolved_title = title.strip() or summary.title
        mission = self.repository.create(
            owner_user_id=owner_user_id, mission_type=mission_type, title=resolved_title,
            mode=mode, experience_level=experience_level, workspace_id=workspace_id,
        )
        self._log(mission["id"], owner_user_id, "POST", "/api/missions", 201, "success", "Missão criada")
        return self._decorate(mission)

    def autosave(self, mission_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        mission = self.repository.autosave(mission_id, owner_user_id, changes)
        return self._decorate(mission) if mission else None

    def record_decision(self, mission_id: str, owner_user_id: str, *, step_id: str, field_id: str, value: Any, source: str = "user", reason: str | None = None) -> dict[str, Any] | None:
        mission = self.repository.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        decisions = list(mission["context"].get("decisions") or [])
        decisions.append({
            "id": f"dec_{uuid4().hex[:10]}", "step_id": step_id, "field_id": field_id, "value": value,
            "source": source, "reason": reason, "created_at": self._now(), "impacts": [],
        })
        updated = self.repository.autosave(mission_id, owner_user_id, {"context": {**mission["context"], "decisions": decisions}})
        return self._decorate(updated) if updated else None

    def execute_field_action(
        self, mission_id: str, owner_user_id: str, *, step_id: str, field_id: str, action_id: str,
        specialist: str | None, interpolated_prompt: str, insert_mode: str,
        api_key: str | None = None, user_model_choice: str | None = None,
    ) -> dict[str, Any] | None:
        mission = self.repository.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        content, degraded = execute_field_action(
            mission_title=mission["title"], step_title=step_id, field_label=field_id,
            specialist=specialist or "especialista técnico", interpolated_prompt=interpolated_prompt,
            api_key=api_key, user_model_choice=user_model_choice,
        )
        self._log(mission_id, owner_user_id, "POST", f"/api/missions/{mission_id}/ai-action", 200, "success", f"Ação de IA executada ({action_id})" + (" [Modo Degradado]" if degraded else ""))
        return {"content": content, "insert_mode": insert_mode, "degraded": degraded}

    def draft_artifacts(self, mission_id: str, owner_user_id: str, *, artifact_definitions: list[dict[str, Any]], step_titles: dict[str, str], api_key: str | None = None, user_model_choice: str | None = None) -> tuple[list[dict[str, Any]], bool] | None:
        """Generates draft artifacts WITHOUT persisting them -- the mission is
        only updated once the user reviews and calls confirm_artifacts (vault
        ask: "sempre pergunta pro usuário se ele aceita")."""
        mission = self.repository.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        answers = mission["context"].get("answers") or {}
        decisions = mission["context"].get("decisions") or []
        drafts: list[dict[str, Any]] = []
        degraded_any = False
        for definition in artifact_definitions:
            draft, degraded, _meta = draft_artifact(
                artifact_type=definition["type"], artifact_title=definition["title"], mission_title=mission["title"],
                step_titles=step_titles, answers=answers, decisions=decisions,
                api_key=api_key, user_model_choice=user_model_choice,
            )
            degraded_any = degraded_any or degraded
            drafts.append({**draft, "can_feed_mission": definition.get("can_feed_mission") or [], "degraded": degraded})
        self._log(mission_id, owner_user_id, "POST", f"/api/missions/{mission_id}/artifacts/preview", 200, "success", f"{len(artifact_definitions)} rascunho(s) de artefato gerado(s)" + (" [Modo Degradado]" if degraded_any else ""))
        return drafts, degraded_any

    def confirm_artifacts(self, mission_id: str, owner_user_id: str, *, artifacts: list[dict[str, Any]]) -> dict[str, Any] | None:
        mission = self.repository.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        degraded_any = False
        for draft in artifacts:
            degraded_any = degraded_any or bool(draft.get("degraded"))
            persisted = {
                "id": f"art_{uuid4().hex[:10]}", "type": draft["type"], "title": draft["title"],
                "content": draft["content"], "format": draft.get("format", "markdown"),
                "generated_at": self._now(), "can_feed_mission": draft.get("can_feed_mission") or [],
            }
            self.repository.append_artifact(mission_id, owner_user_id, persisted)
        if degraded_any:
            self.repository.set_degraded(mission_id, owner_user_id, True)
        self._log(mission_id, owner_user_id, "POST", f"/api/missions/{mission_id}/artifacts/confirm", 200, "success", f"{len(artifacts)} artefato(s) confirmado(s) pelo usuário")
        return self.get_mission(mission_id, owner_user_id)

    def archive(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        mission = self.repository.update_status(mission_id, owner_user_id, "abandoned")
        return self._decorate(mission) if mission else None

    def delete(self, mission_id: str, owner_user_id: str) -> bool:
        return self.repository.delete_for_owner(mission_id, owner_user_id)

    # --------------------------------------------------------------- internal
    def _decorate(self, mission: dict[str, Any] | None) -> dict[str, Any] | None:
        return mission

    def _log(self, mission_id: str, owner_user_id: str, method: str | None, endpoint: str | None, http_status: int | None, status: str, message: str) -> None:
        self.repository.append_operation(mission_id, owner_user_id, {"id": f"op_{uuid4().hex[:10]}", "timestamp": self._now(), "method": method, "endpoint": endpoint, "http_status": http_status, "status": status, "message": message, "detail": None})

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
