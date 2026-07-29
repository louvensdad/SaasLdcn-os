from __future__ import annotations

from typing import Any, Callable

from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.schemas.generation_validation import GenerationValidationReport
from app.services.build_validation_service import build_validation_service
from app.services.dependency_research_service import dependency_research_service
from app.services.generated_project_service import GeneratedProjectService


class GenerationValidationEngine:
    def __init__(self) -> None:
        self.quality_engine = GeneratedProjectQualityEngine()
        self.files_service = GeneratedProjectService()

    def validate(
        self,
        project: dict[str, Any],
        *,
        event_sink: Callable[[dict[str, Any]], None] | None = None,
        max_build_attempts: int | None = None,
    ) -> GenerationValidationReport:
        quality = self.quality_engine.quality_check(project)
        dependency_audit = dependency_research_service.audit_manifest(
            self.files_service.export_files(project)
        )
        build_kwargs: dict[str, Any] = {"event_sink": event_sink}
        if max_build_attempts is not None:
            build_kwargs["max_attempts"] = max_build_attempts
        build = build_validation_service.validate(project, **build_kwargs)

        score = int(quality.get("score", 0))
        if dependency_audit.status == "failed":
            score = max(0, score - 10)
        if not build.ok:
            score = max(0, score - 15)

        security_findings = list(quality.get("security_findings") or [])
        passed = bool(quality.get("passed")) and dependency_audit.status != "failed" and build.ok
        warnings = list(quality.get("warnings") or [])
        if dependency_audit.status == "skipped" and dependency_audit.skipped_reason:
            warnings.append(f"Dependency audit skipped: {dependency_audit.skipped_reason}")
        if build.skipped_reason:
            warnings.append(f"Build validation skipped: {build.skipped_reason}")

        return GenerationValidationReport(
            project_id=str(project["project_id"]),
            score=score,
            passed=passed,
            quality=quality,
            security_findings=security_findings,
            dependency_audit=dependency_audit,
            build=build,
            warnings=warnings,
        )


generation_validation_engine = GenerationValidationEngine()
