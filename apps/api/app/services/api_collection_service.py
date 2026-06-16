from __future__ import annotations

import json
import re
from typing import Any, Literal

from fastapi import HTTPException, status

from app.schemas.api_collection import ApiCollectionResponse, GeneratedEndpoint, GeneratedEndpointsResponse
from app.services.generated_project_service import GeneratedProjectService

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


class ApiCollectionService:
    def __init__(self) -> None:
        self.files = GeneratedProjectService()

    def list_endpoints(self, project: dict[str, Any]) -> GeneratedEndpointsResponse:
        source_path, spec = self._openapi(project)
        endpoints = self._endpoints(spec)
        return GeneratedEndpointsResponse(project_id=project["project_id"], source_path=source_path, endpoints=endpoints)

    def collection(self, project: dict[str, Any], format: Literal["postman", "insomnia"]) -> ApiCollectionResponse:
        endpoints = self.list_endpoints(project)
        collection = self._postman(endpoints.endpoints) if format == "postman" else self._insomnia(project["project_id"], endpoints.endpoints)
        filename = f"{project['project_id']}.{format}.json"
        return ApiCollectionResponse(project_id=project["project_id"], format=format, filename=filename, collection=collection)

    def _openapi(self, project: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        listing = self.files.list_files(project)
        candidates = [
            item["relative_path"]
            for item in listing["files"]
            if item["relative_path"].lower().endswith(("openapi.yaml", "openapi.yml", "openapi.json"))
        ]
        if not candidates:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated openapi.yaml was not found.")
        source_path = sorted(candidates, key=len)[0]
        content = self.files.read_file(project, source_path)["content"] or ""
        return source_path, self._parse_spec(content)

    def _parse_spec(self, content: str) -> dict[str, Any]:
        stripped = content.strip()
        if not stripped:
            return {"paths": {}}
        if stripped.startswith("{"):
            return json.loads(stripped)
        try:
            import yaml  # type: ignore

            parsed = yaml.safe_load(stripped)
            return parsed if isinstance(parsed, dict) else {"paths": {}}
        except Exception:
            return self._parse_openapi_paths_fallback(stripped)

    def _parse_openapi_paths_fallback(self, content: str) -> dict[str, Any]:
        paths: dict[str, dict[str, Any]] = {}
        current_path: str | None = None
        current_method: str | None = None
        in_paths = False
        for raw in content.splitlines():
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            indent = len(raw) - len(raw.lstrip(" "))
            line = raw.strip()
            if line == "paths:":
                in_paths = True
                continue
            if not in_paths:
                continue
            if indent <= 0 and not line.startswith("/"):
                break
            path_match = re.match(r"['\"]?(/[^:'\"]*)['\"]?:\s*$", line)
            if indent <= 2 and path_match:
                current_path = path_match.group(1)
                paths.setdefault(current_path, {})
                current_method = None
                continue
            method_match = re.match(r"(get|post|put|patch|delete|head|options):\s*$", line, re.I)
            if current_path and indent <= 4 and method_match:
                current_method = method_match.group(1).lower()
                paths[current_path].setdefault(current_method, {})
                continue
            kv_match = re.match(r"([A-Za-z0-9_-]+):\s*['\"]?(.*?)['\"]?\s*$", line)
            if current_path and current_method and kv_match:
                key, value = kv_match.group(1), kv_match.group(2)
                if key in {"summary", "operationId", "x-business-rule"}:
                    paths[current_path][current_method][key] = value
        return {"paths": paths}

    def _endpoints(self, spec: dict[str, Any]) -> list[GeneratedEndpoint]:
        paths = spec.get("paths") or {}
        endpoints: list[GeneratedEndpoint] = []
        if not isinstance(paths, dict):
            return endpoints
        for path, methods in paths.items():
            if not isinstance(methods, dict):
                continue
            for method, operation in methods.items():
                method_lower = str(method).lower()
                if method_lower not in HTTP_METHODS:
                    continue
                op = operation if isinstance(operation, dict) else {}
                endpoints.append(
                    GeneratedEndpoint(
                        method=method_lower.upper(),
                        path=str(path),
                        summary=op.get("summary"),
                        operation_id=op.get("operationId"),
                        x_business_rule=op.get("x-business-rule") or op.get("x_business_rule"),
                    )
                )
        return endpoints

    def _postman(self, endpoints: list[GeneratedEndpoint]) -> dict[str, Any]:
        return {
            "info": {
                "name": "Generated API",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            "variable": [{"key": "baseUrl", "value": "http://localhost:8000"}],
            "item": [
                {
                    "name": endpoint.summary or f"{endpoint.method} {endpoint.path}",
                    "request": {
                        "method": endpoint.method,
                        "header": [],
                        "url": {
                            "raw": "{{baseUrl}}" + endpoint.path,
                            "host": ["{{baseUrl}}"],
                            "path": [part for part in endpoint.path.strip("/").split("/") if part],
                        },
                    },
                }
                for endpoint in endpoints
            ],
        }

    def _insomnia(self, project_id: str, endpoints: list[GeneratedEndpoint]) -> dict[str, Any]:
        workspace_id = f"wrk_{project_id}"
        resources: list[dict[str, Any]] = [
            {"_id": workspace_id, "_type": "workspace", "name": "Generated API"},
            {"_id": f"env_{project_id}", "_type": "environment", "parentId": workspace_id, "data": {"baseUrl": "http://localhost:8000"}},
        ]
        for idx, endpoint in enumerate(endpoints):
            resources.append(
                {
                    "_id": f"req_{idx}_{endpoint.method.lower()}",
                    "_type": "request",
                    "parentId": workspace_id,
                    "name": endpoint.summary or f"{endpoint.method} {endpoint.path}",
                    "method": endpoint.method,
                    "url": "{{ _.baseUrl }}" + endpoint.path,
                    "body": {},
                    "headers": [],
                }
            )
        return {"_type": "export", "__export_format": 4, "__export_source": "ldcn-os", "resources": resources}


api_collection_service = ApiCollectionService()
