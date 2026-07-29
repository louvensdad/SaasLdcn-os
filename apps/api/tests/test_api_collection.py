from __future__ import annotations

import shutil
from pathlib import Path

from app.services.api_collection_service import ApiCollectionService
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


def test_api_collection_lists_endpoints_and_exports_postman():
    writer = ProjectWriter()
    result = writer.write(
        [
            EmittedFile(
                path="openapi.yaml",
                content=(
                    "openapi: 3.0.3\n"
                    "paths:\n"
                    "  /orders:\n"
                    "    get:\n"
                    "      summary: List orders\n"
                    "    post:\n"
                    "      summary: Create order\n"
                    "      x-business-rule: Only authenticated users can create orders.\n"
                ),
            )
        ],
        project_name="api-collection-test",
    )
    root = Path(result.root_path)
    try:
        project = {"project_id": result.project_id, "generated_project_path": result.root_path}
        service = ApiCollectionService()

        endpoints = service.list_endpoints(project)
        assert [item.method for item in endpoints.endpoints] == ["GET", "POST"]
        assert endpoints.endpoints[1].x_business_rule == "Only authenticated users can create orders."

        collection = service.collection(project, "postman")
        assert collection.filename.endswith(".postman.json")
        assert collection.collection["item"][0]["request"]["method"] == "GET"
    finally:
        shutil.rmtree(root, ignore_errors=True)
