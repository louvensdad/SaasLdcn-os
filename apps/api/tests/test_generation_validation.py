from __future__ import annotations

import shutil
from pathlib import Path

from app.engines.generation_validation_engine import GenerationValidationEngine
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


def test_generation_validation_consolidates_quality_dependency_and_build_skip():
    writer = ProjectWriter()
    result = writer.write(
        [EmittedFile(path="openapi.yaml", content="openapi: 3.0.3\npaths: {}\n")],
        project_name="validation-test",
    )
    root = Path(result.root_path)
    try:
        report = GenerationValidationEngine().validate({
            "project_id": result.project_id,
            "generated_project_path": result.root_path,
        })

        assert report.project_id == result.project_id
        assert report.score >= 0
        assert report.dependency_audit.status == "skipped"
        assert report.build.installed == "skipped"
        assert report.quality["project_id"] == result.project_id
    finally:
        shutil.rmtree(root, ignore_errors=True)
