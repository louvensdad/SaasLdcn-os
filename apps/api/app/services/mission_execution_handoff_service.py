from __future__ import annotations

from app.engines import mission_execution_policy_registry
from app.engines.generation_job_engine import TERMINAL_STATUSES, generation_job_engine
from app.engines.mission_generation_bridge import build_generation_input_manifest, compute_input_checksum
from app.repositories.mission_deliverable_job_repository import MissionDeliverableJobRepository
from app.repositories.mission_execution_handoff_repository import MissionExecutionHandoffRepository
from app.repositories.mission_repository import MissionRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.routes.project_rooms import _resolve_api_key
from app.routes.project_rooms import service as project_room_service
from app.services.generation_job_creation_service import generation_job_creation_service
from app.services.project_room_service import ENGINEERING_APPROVED_STATUSES
from app.schemas.generation_job import CreateGenerationJobRequest
from app.schemas.orchestrator import ProjectSpec


class MissionNotFoundError(Exception):
    pass


class MissionNotBuildableError(Exception):
    pass


class DeliverablesNotReadyError(Exception):
    pass


class HandoffNotPreparedError(Exception):
    pass


class HandoffAlreadyStartedError(Exception):
    """Raised when prepare_project is called again, with changed mission
    inputs, after generation already started for this mission's room. Silently
    re-running set_spec/generate_prompt/generate_blueprint at that point would
    reset a room that may already be GENERATING/READY back to UNDER_REVIEW --
    a real regression, not a refresh. Out of scope for this bridge: recompiling
    after generation has started needs its own flow, not a silent overwrite."""

    pass


class EngineeringReviewRequiredError(Exception):
    def __init__(self, message: str, *, next_route: str) -> None:
        super().__init__(message)
        self.next_route = next_route


class MissionExecutionHandoffService:
    """Canonical bridge: Mission -> real ProjectRoom -> Engineering
    Review/Stack Approval (untouched, real, manual) -> real GenerationJob.

    Reuses ProjectRoomService.generate_prompt/approve/generate_blueprint (the
    same engines the normal chat journey calls) and
    GenerationJobCreationService (the same gate/create/start logic the
    primary /meta-factory/jobs route uses) -- never re-implements either."""

    def __init__(self) -> None:
        self.mission_repository = MissionRepository()
        self.deliverable_repository = MissionDeliverableJobRepository()
        self.handoff_repository = MissionExecutionHandoffRepository()
        self.room_repository = ProjectRoomRepository()

    # ------------------------------------------------------------ prepare
    def prepare_project(self, mission_id: str, user: dict, *, workspace_id: str | None = None) -> dict:
        owner_user_id = user["user_id"]
        mission = self.mission_repository.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            raise MissionNotFoundError("Missão não encontrada.")

        policy = mission_execution_policy_registry.policy_for(mission["type"])
        if policy is None:
            raise MissionNotBuildableError(
                f"Missões do tipo '{mission['type']}' não geram um projeto executável."
            )

        deliverable_job = self.deliverable_repository.latest_for_mission(mission_id, owner_user_id)
        if deliverable_job is None or deliverable_job["status"] != "COMPLETED":
            raise DeliverablesNotReadyError(
                "Confirme todos os entregáveis da missão antes de preparar o projeto."
            )

        manifest = build_generation_input_manifest(
            mission, deliverable_job["id"], required_types=policy.required_artifact_types
        )
        input_checksum = compute_input_checksum(manifest, deliverable_job["id"])

        existing = self.handoff_repository.get_for_mission(mission_id, owner_user_id)
        if existing is not None and existing["input_checksum"] == input_checksum and existing.get("project_room_id"):
            return self._status_payload(existing, owner_user_id)

        if existing is not None and existing.get("generation_job_id"):
            raise HandoffAlreadyStartedError(
                "A geração deste projeto já foi iniciada; alterações nos entregáveis da missão "
                "não são aplicadas a uma geração em andamento."
            )

        spec, project_name = policy.build_project_spec(mission)

        if existing is not None and existing.get("project_room_id"):
            # Recompiled mission: same real room, new prompt/blueprint versions
            # via the room's own versioning -- never a duplicate room.
            room_id = existing["project_room_id"]
            handoff_id = existing["id"]
        else:
            handoff_id = MissionExecutionHandoffRepository.new_id()
            room = self.room_repository.create(
                owner_user_id=owner_user_id,
                title=project_name,
                workspace_id=workspace_id,
                origin={
                    "source": "MISSION_WORKSPACE",
                    "mission_id": mission_id,
                    "deliverable_job_id": deliverable_job["id"],
                    "handoff_id": handoff_id,
                },
            )
            room_id = room["room_id"]

        self.room_repository.set_spec(
            room_id, owner_user_id, spec.model_dump(mode="json"), confidence=1.0, degraded=False, status="UNDER_REVIEW"
        )

        api_key = _resolve_api_key(user, use_user_key=False, user_model_choice=None, workspace_id=workspace_id)
        project_room_service.generate_prompt(room_id, owner_user_id, api_key=api_key, user_model_choice=None)
        # PromptMaster-only auto-approval: Mission's own confirm() step already
        # reviewed this exact content line-by-line. Engineering Review and
        # Stack Approval remain real, manual gates below -- never auto-approved.
        project_room_service.approve(room_id, owner_user_id)
        project_room_service.generate_blueprint(room_id, owner_user_id, api_key=api_key, user_model_choice=None)

        if existing is None:
            handoff_data, _created = self.handoff_repository.create_or_get(
                mission_id, owner_user_id,
                lambda: {
                    "id": handoff_id,
                    "mission_id": mission_id,
                    "workspace_id": workspace_id,
                    "deliverable_job_id": deliverable_job["id"],
                    "project_room_id": room_id,
                    "generation_job_id": None,
                    "input_checksum": input_checksum,
                    "status": "BLUEPRINT_READY",
                    "data": {"manifest": manifest},
                },
            )
        else:
            handoff_data = self.handoff_repository.update(
                existing["id"], owner_user_id,
                {
                    "project_room_id": room_id,
                    "generation_job_id": existing.get("generation_job_id"),
                    "input_checksum": input_checksum,
                    "status": "BLUEPRINT_READY",
                    "data": {"manifest": manifest},
                },
            )

        return self._status_payload(handoff_data, owner_user_id)

    # -------------------------------------------------------------- status
    def get_status(self, mission_id: str, user: dict) -> dict:
        owner_user_id = user["user_id"]
        handoff = self.handoff_repository.get_for_mission(mission_id, owner_user_id)
        if handoff is None:
            raise HandoffNotPreparedError("Nenhuma preparação de projeto encontrada para esta missão.")
        return self._status_payload(handoff, owner_user_id)

    def _status_payload(self, handoff: dict, owner_user_id: str) -> dict:
        room = None
        if handoff.get("project_room_id"):
            room = project_room_service.get_room(handoff["project_room_id"], owner_user_id)
        room_status = room["status"] if room else None
        engineering_approved = bool(room and room_status in ENGINEERING_APPROVED_STATUSES)
        stack_approval = ((room or {}).get("architecture_blueprint") or {}).get("stack_approval") or {}
        stack_approved = stack_approval.get("status") == "APPROVED"
        return {
            "handoff_id": handoff["id"],
            "mission_id": handoff["mission_id"],
            "project_room_id": handoff.get("project_room_id"),
            "room_status": room_status,
            "engineering_approved": engineering_approved,
            "stack_approved": stack_approved,
            "generation_job_id": handoff.get("generation_job_id"),
            "next_route": (
                f"/meta-factory?projectId={handoff['project_room_id']}"
                if handoff.get("generation_job_id")
                else f"/engineering-review?projectId={handoff.get('project_room_id')}"
            ),
        }

    # ---------------------------------------------------------- generation
    def start_generation(self, mission_id: str, user: dict, *, workspace_id: str | None = None) -> dict:
        owner_user_id = user["user_id"]
        handoff = self.handoff_repository.get_for_mission(mission_id, owner_user_id)
        if handoff is None or not handoff.get("project_room_id"):
            raise HandoffNotPreparedError(
                "Prepare o projeto (Preparar projeto) antes de iniciar a geração."
            )

        room_id = handoff["project_room_id"]
        room = project_room_service.get_room(room_id, owner_user_id)
        stack_approval = ((room or {}).get("architecture_blueprint") or {}).get("stack_approval") or {}
        if room is None or room["status"] not in ENGINEERING_APPROVED_STATUSES or stack_approval.get("status") != "APPROVED":
            raise EngineeringReviewRequiredError(
                "Aprove o Engineering Review e a Stack Approval Gate antes de iniciar a geração.",
                next_route=f"/engineering-review?projectId={room_id}",
            )

        # Idempotency: an in-flight job for this mission already exists -- return it, don't duplicate.
        active_job = generation_job_engine.repository.find_active_by_source_mission(
            mission_id, owner_user_id, terminal_statuses=TERMINAL_STATUSES
        )
        if active_job is not None:
            self.handoff_repository.update(
                handoff["id"], owner_user_id,
                {
                    "project_room_id": room_id,
                    "generation_job_id": active_job["id"],
                    "input_checksum": handoff["input_checksum"],
                    "status": "GENERATION_STARTED",
                    "data": handoff.get("data") or {},
                },
            )
            return {
                "job_id": active_job["id"],
                "project_id": room_id,
                "mission_id": mission_id,
                "status": active_job["status"],
                "next_route": f"/meta-factory?projectId={room_id}",
            }

        payload = CreateGenerationJobRequest(
            projectId=room_id,
            workspaceId=workspace_id or room.get("workspace_id"),
            projectName=room["title"],
            spec=ProjectSpec.model_validate(room["spec"]),
            blueprint=room["architecture_blueprint"] or {},
            blueprintVersion=room.get("active_blueprint_version") or 1,
            mode="llm",
        )
        job = generation_job_creation_service.create(payload=payload, user=user, source_mission_id=mission_id)

        self.handoff_repository.update(
            handoff["id"], owner_user_id,
            {
                "project_room_id": room_id,
                "generation_job_id": job["id"],
                "input_checksum": handoff["input_checksum"],
                "status": "GENERATION_STARTED",
                "data": handoff.get("data") or {},
            },
        )

        return {
            "job_id": job["id"],
            "project_id": room_id,
            "mission_id": mission_id,
            "status": job["status"],
            "next_route": f"/meta-factory?projectId={room_id}",
        }


mission_execution_handoff_service = MissionExecutionHandoffService()
