from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.project_requirements_engine import requirements_complete
from app.services.generated_project_service import GeneratedProjectService
from app.services.git_provider_service import git_provider_service


class GitExportEngine:
    def __init__(self) -> None:
        self.generated_projects = GeneratedProjectService()
        self.quality = GeneratedProjectQualityEngine()
        self._jobs: dict[str, dict[str, Any]] = {}

    def preview(self, user_id: str, project: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        return self._build_job(user_id, project, request, execute=False)

    def export(self, user_id: str, project: dict[str, Any], request: dict[str, Any], provider: str) -> dict[str, Any]:
        payload = {**request, "provider": provider}
        return self._build_job(user_id, project, payload, execute=True)

    def status(self, export_id: str) -> dict[str, Any]:
        job = self._jobs.get(export_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Git export '{export_id}' was not found.")
        return {
            key: value
            for key, value in job.items()
            if key in {"contractVersion", "export_id", "status", "repo_url", "security_validation", "files_included", "failure_reason", "blockers"}
        }

    def _build_job(self, user_id: str, project: dict[str, Any], request: dict[str, Any], *, execute: bool) -> dict[str, Any]:
        export_id = f"gitexport_{uuid4().hex[:12]}"
        requested_at = datetime.now(UTC).replace(microsecond=0).isoformat()
        blockers: list[dict[str, str]] = []
        gatekeeper_decision = (project.get("gatekeeper_snapshot") or {}).get("decision")
        if gatekeeper_decision not in {"approved", "approved_with_warnings"}:
            blockers.append(self._blocker("quality_gate_failed", "Quality Gate failed", "Git export requires an approved quality gate.", "View blockers", f"/projects/{project['project_id']}"))
        if not requirements_complete((project.get("blueprint_snapshot") or {}).get("project_requirements")):
            blockers.append(self._blocker("handoff_incomplete", "Generation Handoff incomplete", "Complete project requirements before repository delivery.", "Open checklist", f"/projects/{project['project_id']}"))

        connection = git_provider_service.status(user_id, request["provider"])
        if connection["status"] != "connected":
            provider_label = "GitHub" if request["provider"] == "github" else "GitLab"
            blockers.append(self._blocker("connection_missing", f"{provider_label} account not connected", "A connected provider account is required before exporting.", f"Connect {provider_label}", "/settings#integrations"))
        elif connection["permission"] != "Repository Write":
            blockers.append(self._blocker("permission_missing", "Repository write permission missing", "The current connection has not confirmed repository write access.", "Reauthorize", "/settings#integrations"))

        files: list[dict[str, Any]] = []
        blocked_files: list[str] = []
        try:
            quality = self.quality.quality_check(project)
            if not quality["passed"]:
                blockers.append(self._blocker("generated_quality_failed", "Quality Gate failed", "Generated project quality gate failed. Review generated-project blockers.", "View blockers", f"/projects/{project['project_id']}"))
            file_snapshot = self.generated_projects.list_files(project)
            blocked_files = list(file_snapshot["security"]["blocked_files"])
            files = [
                {
                    "relative_path": item["relative_path"],
                    "size_bytes": item["size_bytes"],
                    "checksum": item["checksum"],
                }
                for item in file_snapshot["files"]
            ]
        except HTTPException as exc:
            blockers.append(self._blocker("generated_project_missing", "Generated project unavailable", str(exc.detail), "Open generation checklist", f"/projects/{project['project_id']}"))

        security_status = "blocked" if blockers else ("filtered" if blocked_files else "safe")
        repo_url = None
        export_status = "blocked" if blockers else "pending"
        if execute and not blockers:
            try:
                repository = git_provider_service.push_initial_commit(
                    user_id,
                    request["provider"],
                    namespace=request["namespace"],
                    repo_name=request["repo_name"],
                    branch=request["branch"],
                    commit_message=request["commit_message"],
                    files=self.generated_projects.export_files(project),
                )
                repo_url = repository["repo_url"]
                export_status = "success"
            except HTTPException as exc:
                blockers.append(self._blocker("provider_export_failed", "Repository export failed", str(exc.detail), "Resolve and retry", "/settings#integrations"))
                export_status = "blocked"
                security_status = "blocked"
        job = {
            "contractVersion": CONTRACT_VERSION,
            "export_id": export_id,
            "provider": request["provider"],
            "repo_name": request["repo_name"],
            "namespace": request["namespace"],
            "visibility": request["visibility"],
            "branch": request["branch"],
            "commit_message": request["commit_message"],
            "project_id": project["project_id"],
            "status": export_status,
            "blockers": blockers,
            "security_validation": {
                "contractVersion": CONTRACT_VERSION,
                "status": security_status,
                "message": " ".join(item["reason"] for item in blockers) if blockers else "Quality gate passed and files are safe for provider transport.",
                "gatekeeper_decision": gatekeeper_decision,
                "blocked_files": blocked_files,
                "blocked_count": len(blocked_files),
                "redacted_fields": ["temporary_token", "credential_reference"],
                "contains_secrets": False,
            },
            "files_included": files,
            "repo_url": repo_url,
            "requested_at": requested_at,
            "completed_at": requested_at if blockers or export_status == "success" else None,
            "failure_reason": " ".join(item["reason"] for item in blockers) if blockers else None,
        }
        self._jobs[export_id] = job
        return job

    @staticmethod
    def _blocker(code: str, problem: str, reason: str, action_label: str, action_href: str) -> dict[str, str]:
        return {
            "code": code,
            "problem": problem,
            "reason": reason,
            "action_label": action_label,
            "action_href": action_href,
        }
