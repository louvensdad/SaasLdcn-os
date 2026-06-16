from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION
from app.engines.generation_handoff_engine import build_generation_handoff_package
from app.services.localization_service import LocalizationService

SAFE_PATH_PATTERN = re.compile(r"^[a-zA-Z0-9._/\\: -]+$")
SAFE_PROJECT_NAME = re.compile(r"[^a-zA-Z0-9_.-]+")
FORBIDDEN_OUTPUT_NAMES = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    "target",
}


BACKEND_TEMPLATES: dict[str, dict[str, Any]] = {
    "fastapi-basic-api": {
        "template_id": "fastapi-basic-api",
        "name": "FastAPI Basic API",
        "language": "python",
        "framework": "fastapi",
        "profiles": ["basic_api", "crud_api", "auth_api", "production_api"],
        "implemented": True,
        "capabilities": ["jwt", "postgresql", "sqlite", "swagger", "health"],
    },
    "spring-boot-basic-rest-api": {
        "template_id": "spring-boot-basic-rest-api",
        "name": "Spring Boot Basic REST API",
        "language": "java",
        "framework": "spring_boot",
        "profiles": ["basic_rest_api", "crud_api", "jwt_api", "clean_architecture_api"],
        "implemented": True,
        "capabilities": ["jwt", "postgresql", "openapi", "h2", "validation"],
    },
    "nestjs-basic-api": {
        "template_id": "nestjs-basic-api",
        "name": "NestJS Basic API",
        "language": "typescript",
        "framework": "nestjs",
        "profiles": ["basic_api", "crud_api", "auth_api"],
        "implemented": True,
        "capabilities": ["jwt", "postgresql", "swagger", "health", "validation"],
    },
    "quarkus-reserved": {
        "template_id": "quarkus-reserved",
        "name": "Quarkus Reserved",
        "language": "java",
        "framework": "quarkus",
        "profiles": [],
        "implemented": False,
        "capabilities": [],
    },
    "micronaut-reserved": {
        "template_id": "micronaut-reserved",
        "name": "Micronaut Reserved",
        "language": "java",
        "framework": "micronaut",
        "profiles": [],
        "implemented": False,
        "capabilities": [],
    },
    "express-basic-api": {
        "template_id": "express-basic-api",
        "name": "Express Basic API",
        "language": "javascript",
        "framework": "express",
        "profiles": ["basic_api", "crud_api", "auth_api"],
        "implemented": True,
        "capabilities": ["jwt", "sqlite", "health", "validation"],
    },
    "fastify-basic-api": {
        "template_id": "fastify-basic-api",
        "name": "Fastify Basic API",
        "language": "typescript",
        "framework": "fastify",
        "profiles": ["basic_api", "crud_api", "auth_api"],
        "implemented": True,
        "capabilities": ["jwt", "sqlite", "health", "validation"],
    },
}

LANGUAGE_ALIASES = {
    "python": "python",
    "py": "python",
    "java": "java",
    "typescript": "typescript",
    "ts": "typescript",
    "javascript": "javascript",
    "js": "javascript",
}
FRAMEWORK_ALIASES = {
    "fastapi": "fastapi",
    "spring": "spring_boot",
    "springboot": "spring_boot",
    "spring_boot": "spring_boot",
    "spring boot": "spring_boot",
    "quarkus": "quarkus",
    "micronaut": "micronaut",
    "nestjs": "nestjs",
    "nest": "nestjs",
    "nest.js": "nestjs",
    "express": "express",
    "fastify": "fastify",
}


class BackendGenerationEngine:
    def __init__(self) -> None:
        self.workspace_root = BASE_DIR.parents[1].resolve()
        self._status: dict[str, dict[str, Any]] = {}

    def templates(self) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "templates": [
                {"contractVersion": CONTRACT_VERSION, **template}
                for template in sorted(BACKEND_TEMPLATES.values(), key=lambda item: item["template_id"])
            ],
        }

    def preview(self, project: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        generation_id = f"backendgen_{uuid4().hex[:12]}"
        context = self._context(project, request)
        validation = self._validate(project, context, write=False)
        files = self._build_files(context) if validation["generation_enabled"] else {}
        manifest = self._manifest(generation_id, project, context, files, validation, status_value="previewed")
        self._status[generation_id] = manifest
        return manifest

    def run(self, project: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        generation_id = f"backendgen_{uuid4().hex[:12]}"
        context = self._context(project, request)
        validation = self._validate(project, context, write=True)
        if not validation["generation_enabled"]:
            manifest = self._manifest(generation_id, project, context, {}, validation, status_value="blocked")
            self._status[generation_id] = manifest
            return manifest

        files = self._build_files(context)
        output_path = self._resolve_output_path(context["target"].get("output_path") or "")
        artifacts = self._write_files(output_path, files, project, context)
        file_tree = self._file_tree(output_path)
        metrics = self._metrics(file_tree, context, output_path)
        manifest = self._manifest(
            generation_id,
            project,
            context,
            files,
            validation,
            status_value="generated",
            output_path=output_path,
            artifacts=artifacts,
            file_tree=file_tree,
            metrics=metrics,
        )
        self._status[generation_id] = manifest
        return manifest

    def status(self, generation_id: str) -> dict[str, Any]:
        manifest = self._status.get(generation_id)
        if manifest is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Generation '{generation_id}' was not found.")
        return manifest

    def _context(self, project: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        target = dict(request["target"])
        profile = dict(request["profile"])
        language = self._normalize_language(target.get("language"))
        framework = self._normalize_framework(target.get("framework"))
        template = self._template_for(language, framework)
        project_name = target.get("project_name") or project["project_name"]
        profile_id = self._normalize_profile_id(str(profile.get("profile_id") or ""), framework)
        capabilities = self._capabilities(project, profile)
        database = self._database(project, profile, capabilities, framework)
        complexity = profile.get("complexity") or self._complexity(profile_id)
        locale_profile = request.get("locale_profile") or project.get("locale_profile") or (project.get("blueprint_snapshot") or {}).get("locale_profile") or {}
        selected_locale = locale_profile.get("selected_locale") or project.get("locale") or "pt-BR"
        fallback_locale = locale_profile.get("fallback_locale") or "pt-BR"
        requirements = (project.get("blueprint_snapshot") or {}).get("project_requirements") or {}
        target["language"] = language
        target["framework"] = framework
        target["project_name"] = project_name
        profile["profile_id"] = profile_id
        profile["capabilities"] = sorted(capabilities)
        profile["database"] = database
        profile["complexity"] = complexity
        return {
            "target": target,
            "profile": profile,
            "template": template,
            "slug": self._slug(project_name),
            "module": self._module_name(project_name),
            "package": "com.ldcn.generated",
            "locale_profile": {
                "selected_locale": selected_locale,
                "fallback_locale": fallback_locale,
                "generated_docs_locale": locale_profile.get("generated_docs_locale") or selected_locale,
                "generated_readme_locale": locale_profile.get("generated_readme_locale") or selected_locale,
                "generated_comments_locale": locale_profile.get("generated_comments_locale") or selected_locale,
            },
            "i18n": LocalizationService().dictionary(selected_locale, fallback_locale)["entries"],
            "project_requirements": requirements,
        }

    def _validate(self, project: dict[str, Any], context: dict[str, Any], *, write: bool) -> dict[str, Any]:
        checks: list[dict[str, str]] = []
        failures: list[dict[str, Any]] = []
        handoff = build_generation_handoff_package(project)
        handoff_readiness = handoff["handoff_readiness"]
        self._check(
            checks,
            failures,
            "handoff_ready",
            handoff_readiness == "ready",
            "Generation handoff is ready.",
            "Generation Disabled: required handoff flow is blocked or incomplete.",
            "invalid_handoff",
            [project["project_id"]],
        )

        project_framework = ((project.get("technology_graph") or {}).get("framework") or {}).get("id")
        project_language = ((project.get("technology_graph") or {}).get("language") or {}).get("id")
        target = context["target"]
        if project_framework:
            self._check(
                checks,
                failures,
                "framework_matches_project",
                project_framework == target["framework"],
                "Target framework matches the project technology graph.",
                f"Target framework '{target['framework']}' does not match project framework '{project_framework}'.",
                "framework_mismatch",
                [project_framework, target["framework"]],
            )
        if project_language:
            language_ok = project_language == target["language"] or (project_language == "typescript" and target["language"] == "typescript")
            self._check(
                checks,
                failures,
                "language_matches_project",
                language_ok,
                "Target language matches the project technology graph.",
                f"Target language '{target['language']}' does not match project language '{project_language}'.",
                "language_mismatch",
                [project_language, target["language"]],
            )

        template = context["template"]
        self._check(
            checks,
            failures,
            "template_implemented",
            bool(template and template["implemented"]),
            "Template is implemented locally.",
            "Selected backend framework is reserved but not implemented in V2 foundation.",
            "template_not_implemented",
            [target["framework"]],
        )
        profile_id = context["profile"]["profile_id"]
        self._check(
            checks,
            failures,
            "profile_supported",
            bool(template and profile_id in template["profiles"]),
            "Profile is supported by the selected template.",
            f"Profile '{profile_id}' is not supported by framework '{target['framework']}'.",
            "unsupported_profile",
            [profile_id],
        )

        if write:
            output_path = str(target.get("output_path") or "")
            try:
                resolved = self._resolve_output_path(output_path)
                path_ok = True
                path_message = f"Output path is inside workspace: {resolved}"
            except HTTPException as exc:
                path_ok = False
                path_message = str(exc.detail)
            self._check(
                checks,
                failures,
                "security_output_path",
                path_ok,
                path_message,
                path_message,
                "unsafe_output_path",
                [output_path],
            )
        else:
            checks.append({"id": "security_output_path", "status": "passed", "message": "Preview does not write files."})

        blocked = bool(failures)
        return {
            "contractVersion": CONTRACT_VERSION,
            "status": "blocked" if blocked else "passed",
            "generation_enabled": not blocked,
            "security_gate": "blocked" if any(item["code"] == "unsafe_output_path" for item in failures) else "passed",
            "handoff_readiness": handoff_readiness,
            "checks": checks,
            "failures": failures,
        }

    def _build_files(self, context: dict[str, Any]) -> dict[str, str]:
        framework = context["target"]["framework"]
        if framework == "fastapi":
            return self._fastapi_files(context)
        if framework == "spring_boot":
            return self._spring_boot_files(context)
        if framework == "nestjs":
            return self._nestjs_files(context)
        if framework == "express":
            return self._express_files(context)
        if framework == "fastify":
            return self._fastify_files(context)
        return {}

    def _fastapi_files(self, context: dict[str, Any]) -> dict[str, str]:
        caps = set(context["profile"]["capabilities"])
        database = context["profile"]["database"]
        profile_id = context["profile"]["profile_id"]
        include_auth = "jwt" in caps or profile_id in {"auth_api", "production_api"}
        requirements = ["fastapi==0.115.0", "uvicorn==0.30.6", "pydantic==2.8.2"]
        if database == "postgresql":
            requirements.append("psycopg[binary]==3.2.1")
        if include_auth:
            requirements.extend(["python-jose[cryptography]==3.3.0", "passlib[bcrypt]==1.7.4"])
        files = {
            "app/__init__.py": "",
            "app/main.py": self._fastapi_main(include_auth),
            "app/api/__init__.py": "",
            "app/api/health.py": self._fastapi_health(),
            "app/api/items.py": self._fastapi_items(),
            "app/services/__init__.py": "",
            "app/services/item_service.py": self._fastapi_item_service(),
            "app/repositories/__init__.py": "",
            "app/repositories/item_repository.py": self._fastapi_item_repository(),
            "app/models/__init__.py": "",
            "app/models/item.py": self._fastapi_item_model(),
            "app/schemas/__init__.py": "",
            "app/schemas/item.py": self._fastapi_item_schema(),
            "app/core/__init__.py": "",
            "app/core/config.py": self._fastapi_config(database),
            "tests/test_health.py": self._fastapi_test(),
            "requirements.txt": "\n".join(requirements) + "\n",
            "README.md": self._readme(context),
            ".env.example": self._env_example(database, include_auth, context["i18n"]["generation.envDescription"]),
        }
        if include_auth:
            files["app/api/auth.py"] = self._fastapi_auth()
            files["app/core/security.py"] = self._fastapi_security()
        return files

    def _spring_boot_files(self, context: dict[str, Any]) -> dict[str, str]:
        caps = set(context["profile"]["capabilities"])
        profile_id = context["profile"]["profile_id"]
        include_jwt = "jwt" in caps or profile_id == "jwt_api"
        package_path = "src/main/java/com/ldcn/generated"
        return {
            f"{package_path}/application/GeneratedApplication.java": self._spring_application(),
            f"{package_path}/controller/HealthController.java": self._spring_health_controller(),
            f"{package_path}/controller/ItemController.java": self._spring_item_controller(),
            f"{package_path}/service/ItemService.java": self._spring_item_service(),
            f"{package_path}/repository/ItemRepository.java": self._spring_item_repository(),
            f"{package_path}/entity/Item.java": self._spring_item_entity(),
            f"{package_path}/dto/ItemDto.java": self._spring_item_dto(),
            f"{package_path}/config/ApplicationConfig.java": self._spring_config(include_jwt),
            f"{package_path}/exception/ApiException.java": self._spring_exception(),
            "src/main/resources/application.yml": self._spring_application_yml(context),
            "pom.xml": self._spring_pom(context),
            "README.md": self._readme(context),
            ".gitignore": "target/\n*.class\n.env\n",
        }

    def _nestjs_files(self, context: dict[str, Any]) -> dict[str, str]:
        caps = set(context["profile"]["capabilities"])
        profile_id = context["profile"]["profile_id"]
        include_auth = "jwt" in caps or profile_id == "auth_api"
        files = {
            "src/main.ts": self._nestjs_main(),
            "src/app.module.ts": self._nestjs_app_module(include_auth),
            "src/modules/items/items.module.ts": self._nestjs_items_module(),
            "src/controllers/items.controller.ts": self._nestjs_items_controller(),
            "src/services/items.service.ts": self._nestjs_items_service(),
            "src/dto/create-item.dto.ts": self._nestjs_create_item_dto(),
            "src/entities/item.entity.ts": self._nestjs_item_entity(),
            "src/config/app.config.ts": self._nestjs_config(),
            "src/common/health.controller.ts": self._nestjs_health(),
            "package.json": self._nestjs_package_json(context, include_auth),
            "tsconfig.json": self._nestjs_tsconfig(),
            "README.md": self._readme(context),
            ".env.example": self._env_example(context["profile"]["database"], include_auth, context["i18n"]["generation.envDescription"]),
        }
        if include_auth:
            files["src/modules/auth/auth.module.ts"] = self._nestjs_auth_module()
            files["src/controllers/auth.controller.ts"] = self._nestjs_auth_controller()
            files["src/services/auth.service.ts"] = self._nestjs_auth_service()
        return files

    def _express_files(self, context: dict[str, Any]) -> dict[str, str]:
        caps = set(context["profile"]["capabilities"])
        profile_id = context["profile"]["profile_id"]
        include_auth = "jwt" in caps or profile_id == "auth_api"
        files = {
            "src/server.ts": self._express_server(include_auth),
            "src/routes/health.route.ts": self._express_health_route(),
            "src/routes/items.route.ts": self._express_items_route(),
            "src/services/items.service.ts": self._express_items_service(),
            "src/types/item.ts": self._express_item_type(),
            "src/config/app.config.ts": self._express_config(),
            "package.json": self._express_package_json(context, include_auth),
            "tsconfig.json": self._express_tsconfig(),
            "README.md": self._readme(context),
            ".env.example": self._env_example(context["profile"]["database"], include_auth, context["i18n"]["generation.envDescription"]),
        }
        if include_auth:
            files["src/routes/auth.route.ts"] = self._express_auth_route()
            files["src/services/auth.service.ts"] = self._express_auth_service()
        return files

    def _express_server(self, include_auth: bool) -> str:
        auth_import = "import { authRouter } from './routes/auth.route';\n" if include_auth else ""
        auth_mount = "app.use('/auth', authRouter);\n" if include_auth else ""
        return (
            "import express from 'express';\n"
            "import { healthRouter } from './routes/health.route';\n"
            "import { itemsRouter } from './routes/items.route';\n"
            f"{auth_import}\n"
            "const app = express();\n"
            "app.use(express.json());\n"
            "app.use('/health', healthRouter);\n"
            "app.use('/items', itemsRouter);\n"
            f"{auth_mount}\n"
            "const port = process.env.PORT ? Number(process.env.PORT) : 3000;\n"
            "app.listen(port);\n\n"
            "export { app };\n"
        )

    def _express_health_route(self) -> str:
        return "import { Router } from 'express';\n\nconst healthRouter = Router();\n\nhealthRouter.get('/', (_req, res) => {\n  res.json({ status: 'ok' });\n});\n\nexport { healthRouter };\n"

    def _express_items_route(self) -> str:
        return (
            "import { Router } from 'express';\n"
            "import { ItemsService } from '../services/items.service';\n\n"
            "const itemsRouter = Router();\n"
            "const service = new ItemsService();\n\n"
            "itemsRouter.get('/', (_req, res) => {\n  res.json(service.list());\n});\n\n"
            "itemsRouter.post('/', (req, res) => {\n  res.json(service.create(req.body));\n});\n\n"
            "export { itemsRouter };\n"
        )

    def _express_items_service(self) -> str:
        return (
            "import { Item } from '../types/item';\n\n"
            "class ItemsService {\n"
            "  private items: Item[] = [];\n\n"
            "  list(): Item[] {\n    return this.items;\n  }\n\n"
            "  create(payload: { name: string }): Item {\n"
            "    const item: Item = { id: this.items.length + 1, name: payload.name };\n"
            "    this.items = [...this.items, item];\n"
            "    return item;\n  }\n}\n\n"
            "export { ItemsService };\n"
        )

    def _express_item_type(self) -> str:
        return "export interface Item {\n  id: number;\n  name: string;\n}\n"

    def _express_config(self) -> str:
        return "export const appConfig = { env: process.env.APP_ENV ?? 'local' };\n"

    def _express_auth_route(self) -> str:
        return (
            "import { Router } from 'express';\n"
            "import { AuthService } from '../services/auth.service';\n\n"
            "const authRouter = Router();\n"
            "const service = new AuthService();\n\n"
            "authRouter.post('/login', (_req, res) => {\n  res.json(service.login());\n});\n\n"
            "export { authRouter };\n"
        )

    def _express_auth_service(self) -> str:
        return "class AuthService {\n  login() {\n    return { access_token: 'local-preview-token', token_type: 'bearer' };\n  }\n}\n\nexport { AuthService };\n"

    def _express_package_json(self, context: dict[str, Any], include_auth: bool) -> str:
        dependencies = {"express": "^4.19.2"}
        if include_auth:
            dependencies["jsonwebtoken"] = "^9.0.2"
        return json.dumps(
            {
                "name": context["slug"],
                "version": "0.1.0",
                "private": True,
                "scripts": {"build": "tsc -p tsconfig.json", "start": "node dist/server.js"},
                "dependencies": dependencies,
                "devDependencies": {"typescript": "^5.5.4", "@types/express": "^4.17.21", "@types/node": "^20.14.9"},
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"

    def _express_tsconfig(self) -> str:
        return json.dumps(
            {
                "compilerOptions": {
                    "module": "commonjs",
                    "declaration": True,
                    "removeComments": True,
                    "target": "ES2021",
                    "outDir": "./dist",
                    "strict": True,
                    "esModuleInterop": True,
                }
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"

    def _fastify_files(self, context: dict[str, Any]) -> dict[str, str]:
        caps = set(context["profile"]["capabilities"])
        profile_id = context["profile"]["profile_id"]
        include_auth = "jwt" in caps or profile_id == "auth_api"
        files = {
            "src/server.ts": self._fastify_server(include_auth),
            "src/routes/health.route.ts": self._fastify_health_route(),
            "src/routes/items.route.ts": self._fastify_items_route(),
            "src/services/items.service.ts": self._fastify_items_service(),
            "src/types/item.ts": self._fastify_item_type(),
            "src/config/app.config.ts": self._fastify_config(),
            "package.json": self._fastify_package_json(context, include_auth),
            "tsconfig.json": self._fastify_tsconfig(),
            "README.md": self._readme(context),
            ".env.example": self._env_example(context["profile"]["database"], include_auth, context["i18n"]["generation.envDescription"]),
        }
        if include_auth:
            files["src/routes/auth.route.ts"] = self._fastify_auth_route()
            files["src/services/auth.service.ts"] = self._fastify_auth_service()
        return files

    def _fastify_server(self, include_auth: bool) -> str:
        auth_import = "import { authRoutes } from './routes/auth.route';\n" if include_auth else ""
        auth_register = "app.register(authRoutes, { prefix: '/auth' });\n" if include_auth else ""
        return (
            "import Fastify from 'fastify';\n"
            "import { healthRoutes } from './routes/health.route';\n"
            "import { itemsRoutes } from './routes/items.route';\n"
            f"{auth_import}\n"
            "const app = Fastify();\n"
            "app.register(healthRoutes, { prefix: '/health' });\n"
            "app.register(itemsRoutes, { prefix: '/items' });\n"
            f"{auth_register}\n"
            "const port = process.env.PORT ? Number(process.env.PORT) : 3000;\n"
            "app.listen({ port, host: '0.0.0.0' });\n\n"
            "export { app };\n"
        )

    def _fastify_health_route(self) -> str:
        return (
            "import { FastifyInstance } from 'fastify';\n\n"
            "async function healthRoutes(app: FastifyInstance) {\n"
            "  app.get('/', async () => ({ status: 'ok' }));\n}\n\n"
            "export { healthRoutes };\n"
        )

    def _fastify_items_route(self) -> str:
        return (
            "import { FastifyInstance } from 'fastify';\n"
            "import { ItemsService } from '../services/items.service';\n\n"
            "const service = new ItemsService();\n\n"
            "async function itemsRoutes(app: FastifyInstance) {\n"
            "  app.get('/', async () => service.list());\n"
            "  app.post('/', async (request) => service.create(request.body as { name: string }));\n}\n\n"
            "export { itemsRoutes };\n"
        )

    def _fastify_items_service(self) -> str:
        return (
            "import { Item } from '../types/item';\n\n"
            "class ItemsService {\n"
            "  private items: Item[] = [];\n\n"
            "  list(): Item[] {\n    return this.items;\n  }\n\n"
            "  create(payload: { name: string }): Item {\n"
            "    const item: Item = { id: this.items.length + 1, name: payload.name };\n"
            "    this.items = [...this.items, item];\n"
            "    return item;\n  }\n}\n\n"
            "export { ItemsService };\n"
        )

    def _fastify_item_type(self) -> str:
        return "export interface Item {\n  id: number;\n  name: string;\n}\n"

    def _fastify_config(self) -> str:
        return "export const appConfig = { env: process.env.APP_ENV ?? 'local' };\n"

    def _fastify_auth_route(self) -> str:
        return (
            "import { FastifyInstance } from 'fastify';\n"
            "import { AuthService } from '../services/auth.service';\n\n"
            "const service = new AuthService();\n\n"
            "async function authRoutes(app: FastifyInstance) {\n"
            "  app.post('/login', async () => service.login());\n}\n\n"
            "export { authRoutes };\n"
        )

    def _fastify_auth_service(self) -> str:
        return "class AuthService {\n  login() {\n    return { access_token: 'local-preview-token', token_type: 'bearer' };\n  }\n}\n\nexport { AuthService };\n"

    def _fastify_package_json(self, context: dict[str, Any], include_auth: bool) -> str:
        dependencies = {"fastify": "^4.28.1"}
        if include_auth:
            dependencies["jsonwebtoken"] = "^9.0.2"
        return json.dumps(
            {
                "name": context["slug"],
                "version": "0.1.0",
                "private": True,
                "scripts": {"build": "tsc -p tsconfig.json", "start": "node dist/server.js"},
                "dependencies": dependencies,
                "devDependencies": {"typescript": "^5.5.4", "@types/node": "^20.14.9"},
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"

    def _fastify_tsconfig(self) -> str:
        return json.dumps(
            {
                "compilerOptions": {
                    "module": "commonjs",
                    "declaration": True,
                    "removeComments": True,
                    "target": "ES2021",
                    "outDir": "./dist",
                    "strict": True,
                    "esModuleInterop": True,
                }
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"

    def _write_files(self, output_path: Path, files: dict[str, str], project: dict[str, Any], context: dict[str, Any]) -> list[dict[str, Any]]:
        output_path.mkdir(parents=True, exist_ok=False)
        artifacts: list[dict[str, Any]] = []
        for relative_path, content in sorted(files.items()):
            relative = self._safe_relative_path(relative_path)
            target = output_path / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="\n")
            artifacts.append(self._artifact("file", relative.as_posix(), target))

        metadata = {
            "contractVersion": CONTRACT_VERSION,
            "runtime": "backend_generation_v2",
            "project_id": project["project_id"],
            "project_name": project["project_name"],
            "template_id": context["template"]["template_id"],
            "framework": context["target"]["framework"],
            "language": context["target"]["language"],
            "profile": context["profile"],
            "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
            "deterministic": True,
            "no_ai": True,
            "no_agents": True,
            "no_shell_execution": True,
            "no_external_access": True,
        }
        for name in [".ldcn-generation.json", ".ldcn-backend-generation.json"]:
            metadata_path = output_path / name
            metadata_path.write_text(json.dumps(metadata, ensure_ascii=True, indent=2, sort_keys=True), encoding="utf-8", newline="\n")
            artifacts.append(self._artifact("metadata", name, metadata_path))
        return artifacts

    def _manifest(
        self,
        generation_id: str,
        project: dict[str, Any],
        context: dict[str, Any],
        files: dict[str, str],
        validation: dict[str, Any],
        *,
        status_value: str,
        output_path: Path | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        file_tree: list[str] | None = None,
        metrics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        preview_tree = sorted(files.keys())
        manifest_tree = file_tree if file_tree is not None else preview_tree
        manifest_metrics = metrics or self._preview_metrics(files, context)
        return {
            "contractVersion": CONTRACT_VERSION,
            "generation_id": generation_id,
            "project_id": project["project_id"],
            "project_name": context["target"]["project_name"],
            "status": status_value,
            "target": context["target"],
            "profile": context["profile"],
            "template_id": context["template"]["template_id"],
            "template_name": context["template"]["name"],
            "output_path": str(output_path) if output_path else context["target"].get("output_path"),
            "artifacts": artifacts or self._preview_artifacts(files),
            "file_tree": manifest_tree,
            "validation": validation,
            "metrics": manifest_metrics,
            "metadata": {
                "runtime": "backend_generation_v2",
                "deterministic": True,
                "no_ai": True,
                "no_agents": True,
                "no_deploy": True,
                "no_remote_execution": True,
                "no_external_access": True,
            },
        }

    def _resolve_output_path(self, output_path: str) -> Path:
        if not output_path.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="target.output_path is required for backend generation run.")
        if "\x00" in output_path or not SAFE_PATH_PATTERN.match(output_path):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid output path.")
        candidate = Path(output_path)
        if candidate.is_absolute() and candidate.drive and candidate.drive.lower().startswith(("c:", "d:")):
            pass
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
            if any(part == ".." for part in candidate.parts):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        if any(part in FORBIDDEN_OUTPUT_NAMES for part in candidate.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Protected output directories are not allowed.")
        resolved = (candidate if candidate.is_absolute() else self.workspace_root / candidate).resolve()
        if self.workspace_root not in resolved.parents and resolved != self.workspace_root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Output path must stay inside the LDCN OS workspace.")
        if resolved == self.workspace_root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Output path cannot be the workspace root.")
        if resolved.exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Output path already exists. Backend generation will not overwrite an existing directory.")
        return resolved

    def _safe_relative_path(self, relative_path: str) -> Path:
        path = Path(relative_path)
        if path.is_absolute() or any(part == ".." for part in path.parts) or any(part in FORBIDDEN_OUTPUT_NAMES for part in path.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template attempted to write outside the output directory.")
        return path

    def _file_tree(self, root: Path) -> list[str]:
        return sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))

    def _metrics(self, file_tree: list[str], context: dict[str, Any], root: Path) -> dict[str, Any]:
        files = [root / item for item in file_tree if (root / item).is_file()]
        directories = [root / item for item in file_tree if (root / item).is_dir()]
        return {
            "contractVersion": CONTRACT_VERSION,
            "file_count": len(files),
            "directory_count": len(directories),
            "total_size_bytes": sum(path.stat().st_size for path in files),
            "complexity": context["profile"].get("complexity") or "basic",
            "framework": context["target"]["framework"],
            "template_id": context["template"]["template_id"],
        }

    def _preview_metrics(self, files: dict[str, str], context: dict[str, Any]) -> dict[str, Any]:
        directories = {str(Path(path).parent).replace("\\", "/") for path in files if str(Path(path).parent) != "."}
        return {
            "contractVersion": CONTRACT_VERSION,
            "file_count": len(files),
            "directory_count": len(directories),
            "total_size_bytes": sum(len(content.encode("utf-8")) for content in files.values()),
            "complexity": context["profile"].get("complexity") or "basic",
            "framework": context["target"]["framework"],
            "template_id": context["template"]["template_id"],
        }

    def _preview_artifacts(self, files: dict[str, str]) -> list[dict[str, Any]]:
        artifacts = []
        for relative_path, content in sorted(files.items()):
            data = content.encode("utf-8")
            artifacts.append(
                {
                    "contractVersion": CONTRACT_VERSION,
                    "id": f"artifact_{hashlib.sha256(relative_path.encode('utf-8')).hexdigest()[:12]}",
                    "kind": "file",
                    "relative_path": relative_path,
                    "size_bytes": len(data),
                    "checksum": hashlib.sha256(data).hexdigest(),
                }
            )
        return artifacts

    def _artifact(self, kind: str, relative_path: str, path: Path) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": f"artifact_{hashlib.sha256(relative_path.encode('utf-8')).hexdigest()[:12]}",
            "kind": kind,
            "relative_path": relative_path,
            "size_bytes": path.stat().st_size,
            "checksum": hashlib.sha256(path.read_bytes()).hexdigest(),
        }

    def _check(
        self,
        checks: list[dict[str, str]],
        failures: list[dict[str, Any]],
        check_id: str,
        passed: bool,
        passed_message: str,
        failed_message: str,
        failure_code: str,
        related_ids: list[str],
    ) -> None:
        checks.append({"id": check_id, "status": "passed" if passed else "blocked", "message": passed_message if passed else failed_message})
        if not passed:
            failures.append({"code": failure_code, "message": failed_message, "recoverable": True, "related_ids": related_ids})

    def _template_for(self, language: str, framework: str) -> dict[str, Any]:
        for template in BACKEND_TEMPLATES.values():
            if template["language"] == language and template["framework"] == framework:
                return template
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unsupported backend target: {language}/{framework}.")

    def _normalize_language(self, value: Any) -> str:
        language = LANGUAGE_ALIASES.get(str(value or "").strip().lower())
        if not language:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported backend language.")
        return language

    def _normalize_framework(self, value: Any) -> str:
        framework = FRAMEWORK_ALIASES.get(str(value or "").strip().lower())
        if not framework:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported backend framework.")
        return framework

    def _normalize_profile_id(self, value: str, framework: str) -> str:
        normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
        if normalized:
            return normalized
        return "basic_rest_api" if framework == "spring_boot" else "basic_api"

    def _capabilities(self, project: dict[str, Any], profile: dict[str, Any]) -> set[str]:
        capabilities = set(str(item) for item in profile.get("capabilities") or [])
        selected = set(project.get("selected_capabilities") or [])
        infrastructure = set(((project.get("blueprint_snapshot") or {}).get("infrastructure_profile") or {}).get("selected_component_ids") or [])
        if "authentication" in selected:
            capabilities.add("jwt")
        if "postgresql" in infrastructure:
            capabilities.add("postgresql")
        if "sqlite" in infrastructure:
            capabilities.add("sqlite")
        capabilities.add("health")
        return capabilities

    def _database(self, project: dict[str, Any], profile: dict[str, Any], capabilities: set[str], framework: str) -> str:
        if profile.get("database"):
            return str(profile["database"]).lower()
        if "postgresql" in capabilities:
            return "postgresql"
        if framework == "spring_boot":
            return "h2"
        return "sqlite"

    def _complexity(self, profile_id: str) -> str:
        if "production" in profile_id:
            return "production"
        if "clean" in profile_id:
            return "clean"
        if "auth" in profile_id or "jwt" in profile_id:
            return "auth"
        if "crud" in profile_id:
            return "crud"
        return "basic"

    def _slug(self, value: str) -> str:
        slug = SAFE_PROJECT_NAME.sub("-", value.lower()).strip("-")
        return slug or "backend-project"

    def _module_name(self, value: str) -> str:
        module = re.sub(r"[^a-zA-Z0-9]+", "_", value.lower()).strip("_")
        return module or "backend_project"

    def _readme(self, context: dict[str, Any]) -> str:
        i18n = context["i18n"]
        requirements = context["project_requirements"]
        requirement_lines = [
            "",
            "## Product Requirements",
            "",
            f"Goal: {requirements.get('project_goal') or 'Not provided'}",
            f"Business context: {requirements.get('business_context') or 'Not provided'}",
            f"Target users: {', '.join(requirements.get('target_users') or []) or 'Not provided'}",
            f"Delivery target: {requirements.get('delivery_target') or 'Not provided'}",
            "",
            "### Business Rules",
            *[f"- {item}" for item in requirements.get("business_rules") or []],
            "",
            "### Workflows",
            *[f"- {item}" for item in requirements.get("workflows") or []],
            "",
            "### Entities",
            *[f"- {item}" for item in requirements.get("entities") or []],
            "",
            "### Constraints",
            *[f"- {item}" for item in requirements.get("constraints") or []],
        ]
        return "\n".join(
            [
                f"# {context['target']['project_name']}",
                "",
                i18n["generation.generatedBy"],
                "",
                f"- {i18n['generation.language']}: {context['target']['language']}",
                f"- {i18n['generation.framework']}: {context['target']['framework']}",
                f"- {i18n['generation.profile']}: {context['profile']['profile_id']}",
                f"- {i18n['generation.database']}: {context['profile']['database']}",
                *requirement_lines,
                "",
                i18n["generation.safety"],
            ]
        ) + "\n"

    def _env_example(self, database: str, include_auth: bool, description: str = "Local deterministic environment configuration.") -> str:
        lines = [f"# {description}", "APP_ENV=local", f"DATABASE_KIND={database}"]
        if database == "postgresql":
            lines.append("DATABASE_URL=postgresql://user:password@localhost:5432/app")
        else:
            lines.append("DATABASE_URL=sqlite:///./app.db")
        if include_auth:
            lines.append("JWT_SECRET=change-me-local-only")
        return "\n".join(lines) + "\n"

    def _fastapi_main(self, include_auth: bool) -> str:
        auth_import = "from app.api import auth\n" if include_auth else ""
        auth_router = "app.include_router(auth.router, prefix=\"/auth\", tags=[\"auth\"])\n" if include_auth else ""
        return (
            "from fastapi import FastAPI\n"
            "from app.api import health, items\n"
            f"{auth_import}\n"
            "app = FastAPI(title=\"Generated Backend API\")\n"
            "app.include_router(health.router, tags=[\"health\"])\n"
            "app.include_router(items.router, prefix=\"/items\", tags=[\"items\"])\n"
            f"{auth_router}"
        )

    def _fastapi_health(self) -> str:
        return "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get(\"/health\")\ndef health():\n    return {\"status\": \"ok\"}\n"

    def _fastapi_items(self) -> str:
        return (
            "from fastapi import APIRouter\n"
            "from app.schemas.item import ItemCreate, ItemRead\n"
            "from app.services.item_service import ItemService\n\n"
            "router = APIRouter()\nservice = ItemService()\n\n"
            "@router.get(\"/\", response_model=list[ItemRead])\ndef list_items():\n    return service.list_items()\n\n"
            "@router.post(\"/\", response_model=ItemRead)\ndef create_item(payload: ItemCreate):\n    return service.create_item(payload)\n"
        )

    def _fastapi_item_service(self) -> str:
        return (
            "from app.repositories.item_repository import ItemRepository\n"
            "from app.schemas.item import ItemCreate\n\n"
            "class ItemService:\n"
            "    def __init__(self):\n"
            "        self.repository = ItemRepository()\n\n"
            "    def list_items(self):\n"
            "        return self.repository.list_items()\n\n"
            "    def create_item(self, payload: ItemCreate):\n"
            "        return self.repository.create_item(payload)\n"
        )

    def _fastapi_item_repository(self) -> str:
        return (
            "class ItemRepository:\n"
            "    def __init__(self):\n"
            "        self.items = []\n\n"
            "    def list_items(self):\n"
            "        return self.items\n\n"
            "    def create_item(self, payload):\n"
            "        item = {\"id\": len(self.items) + 1, **payload.model_dump()}\n"
            "        self.items.append(item)\n"
            "        return item\n"
        )

    def _fastapi_item_model(self) -> str:
        return "from dataclasses import dataclass\n\n@dataclass(frozen=True)\nclass Item:\n    id: int\n    name: str\n"

    def _fastapi_item_schema(self) -> str:
        return "from pydantic import BaseModel\n\nclass ItemCreate(BaseModel):\n    name: str\n\nclass ItemRead(ItemCreate):\n    id: int\n"

    def _fastapi_config(self, database: str) -> str:
        return f"DATABASE_KIND = \"{database}\"\n"

    def _fastapi_auth(self) -> str:
        return "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.post(\"/login\")\ndef login():\n    return {\"access_token\": \"local-preview-token\", \"token_type\": \"bearer\"}\n"

    def _fastapi_security(self) -> str:
        return "JWT_ALGORITHM = \"HS256\"\nTOKEN_TYPE = \"bearer\"\n"

    def _fastapi_test(self) -> str:
        return "from app.main import app\n\n\ndef test_app_title():\n    assert app.title == \"Generated Backend API\"\n"

    def _spring_application(self) -> str:
        return "package com.ldcn.generated.application;\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n\n@SpringBootApplication(scanBasePackages = \"com.ldcn.generated\")\npublic class GeneratedApplication {\n  public static void main(String[] args) {\n    SpringApplication.run(GeneratedApplication.class, args);\n  }\n}\n"

    def _spring_health_controller(self) -> str:
        return "package com.ldcn.generated.controller;\n\nimport java.util.Map;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\npublic class HealthController {\n  @GetMapping(\"/health\")\n  public Map<String, String> health() {\n    return Map.of(\"status\", \"ok\");\n  }\n}\n"

    def _spring_item_controller(self) -> str:
        return "package com.ldcn.generated.controller;\n\nimport com.ldcn.generated.dto.ItemDto;\nimport com.ldcn.generated.service.ItemService;\nimport java.util.List;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.PostMapping;\nimport org.springframework.web.bind.annotation.RequestBody;\nimport org.springframework.web.bind.annotation.RequestMapping;\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\n@RequestMapping(\"/items\")\npublic class ItemController {\n  private final ItemService service;\n  public ItemController(ItemService service) { this.service = service; }\n  @GetMapping\n  public List<ItemDto> list() { return service.list(); }\n  @PostMapping\n  public ItemDto create(@RequestBody ItemDto item) { return service.create(item); }\n}\n"

    def _spring_item_service(self) -> str:
        return "package com.ldcn.generated.service;\n\nimport com.ldcn.generated.dto.ItemDto;\nimport com.ldcn.generated.repository.ItemRepository;\nimport java.util.List;\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class ItemService {\n  private final ItemRepository repository;\n  public ItemService(ItemRepository repository) { this.repository = repository; }\n  public List<ItemDto> list() { return repository.list(); }\n  public ItemDto create(ItemDto item) { return repository.create(item); }\n}\n"

    def _spring_item_repository(self) -> str:
        return "package com.ldcn.generated.repository;\n\nimport com.ldcn.generated.dto.ItemDto;\nimport java.util.ArrayList;\nimport java.util.List;\nimport org.springframework.stereotype.Repository;\n\n@Repository\npublic class ItemRepository {\n  private final List<ItemDto> items = new ArrayList<>();\n  public List<ItemDto> list() { return List.copyOf(items); }\n  public ItemDto create(ItemDto item) {\n    ItemDto saved = new ItemDto(items.size() + 1L, item.name());\n    items.add(saved);\n    return saved;\n  }\n}\n"

    def _spring_item_entity(self) -> str:
        return "package com.ldcn.generated.entity;\n\npublic class Item {\n  private Long id;\n  private String name;\n}\n"

    def _spring_item_dto(self) -> str:
        return "package com.ldcn.generated.dto;\n\npublic record ItemDto(Long id, String name) {}\n"

    def _spring_config(self, include_jwt: bool) -> str:
        token = "  public String tokenType() { return \"bearer\"; }\n" if include_jwt else ""
        return f"package com.ldcn.generated.config;\n\nimport org.springframework.context.annotation.Configuration;\n\n@Configuration\npublic class ApplicationConfig {{\n{token}}}\n"

    def _spring_exception(self) -> str:
        return "package com.ldcn.generated.exception;\n\npublic class ApiException extends RuntimeException {\n  public ApiException(String message) { super(message); }\n}\n"

    def _spring_application_yml(self, context: dict[str, Any]) -> str:
        database = context["profile"]["database"]
        datasource = "jdbc:h2:mem:generated" if database == "h2" else "jdbc:postgresql://localhost:5432/generated"
        return f"spring:\n  application:\n    name: {context['slug']}\n  datasource:\n    url: {datasource}\nserver:\n  port: 8080\n"

    def _spring_pom(self, context: dict[str, Any]) -> str:
        validation = "      <artifactId>spring-boot-starter-validation</artifactId>" if "validation" in context["profile"]["capabilities"] else "      <artifactId>spring-boot-starter-web</artifactId>"
        return f"<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.ldcn</groupId>\n  <artifactId>{context['slug']}</artifactId>\n  <version>0.1.0</version>\n  <parent>\n    <groupId>org.springframework.boot</groupId>\n    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>3.3.3</version>\n  </parent>\n  <dependencies>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n{validation}\n    </dependency>\n  </dependencies>\n</project>\n"

    def _nestjs_main(self) -> str:
        return "import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n}\nvoid bootstrap();\n"

    def _nestjs_app_module(self, include_auth: bool) -> str:
        auth_import = "import { AuthModule } from './modules/auth/auth.module';\n" if include_auth else ""
        auth_module = ", AuthModule" if include_auth else ""
        return f"import {{ Module }} from '@nestjs/common';\nimport {{ ItemsModule }} from './modules/items/items.module';\nimport {{ HealthController }} from './common/health.controller';\n{auth_import}\n@Module({{ imports: [ItemsModule{auth_module}], controllers: [HealthController] }})\nexport class AppModule {{}}\n"

    def _nestjs_items_module(self) -> str:
        return "import { Module } from '@nestjs/common';\nimport { ItemsController } from '../../controllers/items.controller';\nimport { ItemsService } from '../../services/items.service';\n\n@Module({ controllers: [ItemsController], providers: [ItemsService] })\nexport class ItemsModule {}\n"

    def _nestjs_items_controller(self) -> str:
        return "import { Body, Controller, Get, Post } from '@nestjs/common';\nimport { CreateItemDto } from '../dto/create-item.dto';\nimport { ItemsService } from '../services/items.service';\n\n@Controller('items')\nexport class ItemsController {\n  constructor(private readonly service: ItemsService) {}\n  @Get()\n  list() { return this.service.list(); }\n  @Post()\n  create(@Body() payload: CreateItemDto) { return this.service.create(payload); }\n}\n"

    def _nestjs_items_service(self) -> str:
        return "import { Injectable } from '@nestjs/common';\nimport { CreateItemDto } from '../dto/create-item.dto';\nimport { ItemEntity } from '../entities/item.entity';\n\n@Injectable()\nexport class ItemsService {\n  private items: ItemEntity[] = [];\n  list() { return this.items; }\n  create(payload: CreateItemDto) {\n    const item = { id: this.items.length + 1, ...payload };\n    this.items = [...this.items, item];\n    return item;\n  }\n}\n"

    def _nestjs_create_item_dto(self) -> str:
        return "export class CreateItemDto {\n  name!: string;\n}\n"

    def _nestjs_item_entity(self) -> str:
        return "export interface ItemEntity {\n  id: number;\n  name: string;\n}\n"

    def _nestjs_config(self) -> str:
        return "export const appConfig = { env: process.env.APP_ENV ?? 'local' };\n"

    def _nestjs_health(self) -> str:
        return "import { Controller, Get } from '@nestjs/common';\n\n@Controller('health')\nexport class HealthController {\n  @Get()\n  health() { return { status: 'ok' }; }\n}\n"

    def _nestjs_auth_module(self) -> str:
        return "import { Module } from '@nestjs/common';\nimport { AuthController } from '../../controllers/auth.controller';\nimport { AuthService } from '../../services/auth.service';\n\n@Module({ controllers: [AuthController], providers: [AuthService] })\nexport class AuthModule {}\n"

    def _nestjs_auth_controller(self) -> str:
        return "import { Controller, Post } from '@nestjs/common';\nimport { AuthService } from '../services/auth.service';\n\n@Controller('auth')\nexport class AuthController {\n  constructor(private readonly service: AuthService) {}\n  @Post('login')\n  login() { return this.service.login(); }\n}\n"

    def _nestjs_auth_service(self) -> str:
        return "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class AuthService {\n  login() { return { access_token: 'local-preview-token', token_type: 'bearer' }; }\n}\n"

    def _nestjs_package_json(self, context: dict[str, Any], include_auth: bool) -> str:
        dependencies = {"@nestjs/common": "^10.4.1", "@nestjs/core": "^10.4.1", "reflect-metadata": "^0.2.2", "rxjs": "^7.8.1"}
        if include_auth:
            dependencies["@nestjs/jwt"] = "^10.2.0"
        return json.dumps(
            {
                "name": context["slug"],
                "version": "0.1.0",
                "private": True,
                "scripts": {"build": "tsc -p tsconfig.json", "start": "node dist/main.js"},
                "dependencies": dependencies,
                "devDependencies": {"typescript": "^5.5.4"},
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"

    def _nestjs_tsconfig(self) -> str:
        return json.dumps(
            {
                "compilerOptions": {
                    "module": "commonjs",
                    "declaration": True,
                    "removeComments": True,
                    "emitDecoratorMetadata": True,
                    "experimentalDecorators": True,
                    "target": "ES2021",
                    "outDir": "./dist",
                    "strict": True,
                }
            },
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ) + "\n"
