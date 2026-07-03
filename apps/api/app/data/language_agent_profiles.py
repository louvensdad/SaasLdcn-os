from __future__ import annotations

import re

# Per-language specialist agent profiles.
#
# The factory agents are role-based (backend/qa/devops/docs/repair); this table
# gives each LANGUAGE its own specialist layer, composed on top of the role
# prompt at request time (agent_prompts.system_prompt_for). Config-table-driven
# with graceful fallback: an unknown language simply gets the generic role
# prompt, so nothing here can break an existing flow.
#
# Each profile carries what that ecosystem NEEDS to produce a complete,
# runnable project: mandatory manifests, canonical layout, test tooling,
# build/run commands and packaging conventions.

# Roles that receive a language specialist block. Contracts/frontend/mobile are
# language-fixed by their own rules (OpenAPI, web TS stack, Expo/RN).
LANGUAGE_AWARE_ROLES = frozenset({"backend", "qa", "devops", "docs", "repair"})

LANGUAGE_AGENT_PROFILES: dict[str, dict] = {
    "python": {
        "label": "Python Specialist",
        "aliases": ["py", "python3", "python 3"],
        "manifest": "requirements.txt",
        "source_extensions": [".py"],
        "backend_rules": """Manifesto: requirements.txt (ou pyproject.toml) com TODAS as libs usadas, versoes pinadas (>=,<). Driver de banco compativel com a engine (postgresql+psycopg2 -> psycopg2-binary; async -> asyncpg + engine async).
Layout: pacote app/ com __init__.py em todo diretorio; entrypoint claro (uvicorn app.main:app para FastAPI; manage.py para Django).
Config: pydantic-settings (FastAPI) ou settings.py (Django) lendo SOMENTE de env vars; .env.example completo.
Tipagem: type hints em todo servico/use-case; modelos Pydantic para request/response.
Testes: pytest + httpx/TestClient; conftest.py com fixtures; nunca teste vazio.
Execucao local: `pip install -r requirements.txt` + comando de run documentado que funciona.""",
        "ecosystem_notes": """Python: instala com `pip install -r requirements.txt`; testes com `pytest`; imagem Docker base python:3.12-slim; entrypoint uvicorn/gunicorn (FastAPI) ou gunicorn wsgi (Django); lint ruff.""",
    },
    "typescript": {
        "label": "TypeScript/Node Specialist",
        "aliases": ["ts", "node", "nodejs", "node.js", "javascript", "js", "typescript/node"],
        "manifest": "package.json",
        "source_extensions": [".ts", ".tsx", ".js"],
        "backend_rules": """Manifesto: package.json com TODA lib usada em dependencies/devDependencies e scripts reais (dev, build, start, test); tsconfig.json valido (strict: true).
Layout: src/ com modulos por dominio (NestJS: module/controller/service/provider; Express/Fastify: routes/services/repositories separados).
Config: variaveis SOMENTE via process.env com validacao no bootstrap (ex.: zod/env-var); .env.example completo.
Tipagem: strict; DTOs tipados; nunca `any` em contrato publico.
Testes: vitest ou jest configurado no package.json; pelo menos 1 teste real por service.
Execucao local: `npm install` + `npm run dev` (e `npm run build` + `npm start` para producao) — cada script citado EXISTE no package.json.""",
        "ecosystem_notes": """Node/TypeScript: instala com `npm install`; build `npm run build` (tsc); testes `npm test`; imagem Docker base node:22-alpine com build multi-stage (builder + runtime só com dist/ e node_modules de producao).""",
    },
    "java": {
        "label": "Java Specialist",
        "aliases": ["java 17", "java 21", "jvm"],
        "manifest": "pom.xml",
        "source_extensions": [".java"],
        "backend_rules": """Manifesto: pom.xml (Maven, preferido) ou build.gradle com TODAS as dependencias usadas e a versao do Java (17+) explicita; Spring Boot via spring-boot-starter-parent.
Layout: pacotes por camada (domain/application/infrastructure/interface ou controller/service/repository) sob um groupId coerente; classe @SpringBootApplication como entrypoint.
Config: application.yml (ou .properties) com TODAS as propriedades referenciadas, valores sensiveis via ${ENV_VAR}; .env.example correspondente.
Persistencia: Spring Data JPA + migracao (Flyway/Liquibase) quando houver banco; entidades JPA completas.
Testes: JUnit 5 + Mockito; @SpringBootTest apenas onde necessario; pelo menos 1 teste real por service.
Execucao local: `mvn spring-boot:run` (ou ./mvnw) — o wrapper ou o comando documentado bate com os arquivos gerados.""",
        "ecosystem_notes": """Java: build com `mvn -DskipTests package` (ou gradle build); testes `mvn test`; imagem Docker multi-stage (maven:3.9-eclipse-temurin-17 -> eclipse-temurin:17-jre-alpine); jar executavel em target/.""",
    },
    "csharp": {
        "label": "C#/.NET Specialist",
        "aliases": ["c#", ".net", "dotnet", "csharp/.net", "c#/.net"],
        "manifest": "*.csproj",
        "source_extensions": [".cs"],
        "backend_rules": """Manifesto: arquivo .csproj (net8.0) com TODOS os PackageReference usados; um .sln quando houver mais de um projeto.
Layout: ASP.NET Core minimal APIs ou controllers; Clean Architecture com projetos/pastas Domain, Application, Infrastructure, Api quando o dominio justificar.
Config: appsettings.json + appsettings.Development.json com TODAS as chaves referenciadas; segredos via variaveis de ambiente (builder.Configuration), nunca hardcoded; .env.example correspondente.
Persistencia: EF Core com DbContext registrado via DI e migrations quando houver banco.
Testes: xUnit; projeto de teste proprio (*.Tests.csproj) referenciando o projeto alvo; pelo menos 1 teste real por service/handler.
Execucao local: `dotnet restore` + `dotnet run --project <Api>` — os caminhos citados existem.""",
        "ecosystem_notes": """.NET: build com `dotnet build`; testes `dotnet test`; imagem Docker multi-stage (mcr.microsoft.com/dotnet/sdk:8.0 -> aspnet:8.0); publish em /app/publish.""",
    },
    "go": {
        "label": "Go Specialist",
        "aliases": ["golang"],
        "manifest": "go.mod",
        "source_extensions": [".go"],
        "backend_rules": """Manifesto: go.mod com module path coerente e TODAS as dependencias usadas (go.sum implicito no build).
Layout: cmd/<app>/main.go como entrypoint; internal/ para dominio e handlers (internal/http, internal/domain, internal/store); nunca logica de negocio no main.
Config: env vars lidas no bootstrap (os.Getenv com defaults ou envconfig); .env.example completo.
Erros: errors.Is/As e wrapping com %w; nunca panic em caminho de request; contexto (context.Context) propagado em toda chamada de I/O.
Testes: *_test.go padrao com table-driven tests; pelo menos 1 teste real por pacote de dominio.
Execucao local: `go run ./cmd/<app>` e `go build ./...` compilam sem erro.""",
        "ecosystem_notes": """Go: build com `go build ./...`; testes `go test ./...`; imagem Docker multi-stage (golang:1.23-alpine -> alpine/distroless) com binario estatico (CGO_ENABLED=0).""",
    },
    "php": {
        "label": "PHP Specialist",
        "aliases": ["laravel", "php 8"],
        "manifest": "composer.json",
        "source_extensions": [".php"],
        "backend_rules": """Manifesto: composer.json com TODAS as dependencias (php >= 8.2), autoload PSR-4 correto e scripts uteis.
Layout: Laravel padrao (app/Http/Controllers, app/Models, app/Services, routes/api.php, database/migrations) — controllers finos, regra de negocio em Services.
Config: config/*.php lendo env() SOMENTE nos arquivos de config; .env.example completo com APP_KEY placeholder.
Persistencia: Eloquent + migrations completas para TODAS as entidades; seeders quando a spec pedir dados iniciais.
Testes: PHPUnit (ou Pest) com testes Feature por endpoint e Unit por service; pelo menos 1 teste real por service.
Execucao local: `composer install` + `php artisan serve` (migrations documentadas: `php artisan migrate`).""",
        "ecosystem_notes": """PHP: instala com `composer install`; testes `php artisan test` ou `vendor/bin/phpunit`; imagem Docker base php:8.3-fpm-alpine + nginx; nunca copiar vendor/ — instalar no build.""",
    },
    "rust": {
        "label": "Rust Specialist",
        "aliases": [],
        "manifest": "Cargo.toml",
        "source_extensions": [".rs"],
        "backend_rules": """Manifesto: Cargo.toml com TODAS as crates usadas (versoes explicitas) e edition 2021+.
Layout: src/main.rs como entrypoint fino; modulos por dominio (src/routes, src/domain, src/store); Axum ou Actix-web como framework HTTP.
Config: env vars via std::env ou figment/config no bootstrap; .env.example completo.
Erros: thiserror/anyhow; nunca unwrap()/expect() em caminho de request — propague Result e converta em resposta HTTP tipada.
Async: tokio como runtime; nenhuma chamada bloqueante dentro de handler async (use spawn_blocking).
Testes: #[cfg(test)] com testes reais por modulo de dominio + testes de integracao em tests/.
Execucao local: `cargo run` e `cargo build` compilam sem erro.""",
        "ecosystem_notes": """Rust: build com `cargo build --release`; testes `cargo test`; imagem Docker multi-stage (rust:1.80 -> debian:bookworm-slim/distroless) copiando so o binario.""",
    },
    "ruby": {
        "label": "Ruby Specialist",
        "aliases": ["rails", "ruby on rails"],
        "manifest": "Gemfile",
        "source_extensions": [".rb"],
        "backend_rules": """Manifesto: Gemfile com TODAS as gems usadas (ruby >= 3.2); Gemfile.lock implicito no bundle.
Layout: Rails padrao (app/controllers, app/models, app/services, config/routes.rb, db/migrate) — controllers finos, regra de negocio em service objects.
Config: credentials/env vars via ENV.fetch com defaults seguros; .env.example completo.
Persistencia: ActiveRecord + migrations completas para TODAS as entidades.
Testes: RSpec (ou Minitest) com request specs por endpoint e specs por service; pelo menos 1 teste real por service.
Execucao local: `bundle install` + `bin/rails server` (migrations documentadas: `bin/rails db:migrate`).""",
        "ecosystem_notes": """Ruby: instala com `bundle install`; testes `bundle exec rspec`; imagem Docker base ruby:3.3-alpine; assets/bootsnap precompilados no build quando Rails completo.""",
    },
    "kotlin": {
        "label": "Kotlin Specialist",
        "aliases": ["kotlin/jvm"],
        "manifest": "build.gradle.kts",
        "source_extensions": [".kt"],
        "backend_rules": """Manifesto: build.gradle.kts com TODAS as dependencias, plugin kotlin("jvm") e versao do JDK (17+); settings.gradle.kts presente.
Layout: Spring Boot (ou Ktor) com pacotes por camada; data classes para DTOs; entrypoint @SpringBootApplication ou embeddedServer.
Config: application.yml com propriedades sensiveis via ${ENV_VAR}; .env.example correspondente.
Null-safety: tipos nao-nulos por padrao; nunca !! em caminho de request.
Testes: JUnit 5 + MockK; pelo menos 1 teste real por service.
Execucao local: `./gradlew bootRun` (ou run) — o wrapper gradle DEVE ser referenciado de forma consistente com os arquivos gerados.""",
        "ecosystem_notes": """Kotlin: build com `gradle build -x test` (ou ./gradlew); testes `gradle test`; imagem Docker multi-stage (gradle:8-jdk17 -> eclipse-temurin:17-jre-alpine).""",
    },
}

# Canonical (runtime, framework) per language id — the idiomatic, pipeline-proven
# stack applied when the USER explicitly picks a language (Project Room
# preferred_language) and the orchestrator's suggestion must be overridden.
# Mirrors the mock adapter's offline inference so both paths land on the same
# well-supported ecosystems.
DEFAULT_STACK_BY_LANGUAGE: dict[str, tuple[str, str]] = {
    "python": ("python_runtime", "fastapi"),
    "typescript": ("nodejs", "nestjs"),
    "java": ("jvm", "spring_boot"),
    "csharp": ("dotnet", "aspnet_core"),
    "go": ("go_runtime", "gin"),
    "rust": ("rust_runtime", "axum"),
    "php": ("php_runtime", "slim"),
    "ruby": ("ruby_runtime", "sinatra"),
    "kotlin": ("jvm", "ktor"),
}

# Reverse alias index built once at import time.
_ALIAS_TO_LANGUAGE: dict[str, str] = {}
for _lang_id, _profile in LANGUAGE_AGENT_PROFILES.items():
    _ALIAS_TO_LANGUAGE[_lang_id] = _lang_id
    for _alias in _profile.get("aliases", []):
        _ALIAS_TO_LANGUAGE[_alias] = _lang_id


def resolve_language_id(raw: str | None) -> str | None:
    """Normalize a free-text stack language ("Python 3.12", "Node.js + TS",
    "C# (.NET 8)") to a profile id. None when no profile matches — callers then
    fall back to the generic role prompt."""
    if not raw:
        return None
    text = raw.strip().lower()
    if text in _ALIAS_TO_LANGUAGE:
        return _ALIAS_TO_LANGUAGE[text]
    # Word-boundary pass for decorated values ("Python 3.12", "C# (.NET 8)").
    # Longest alias first so "typescript" wins over "ts"; boundaries prevent
    # short aliases from matching inside other words ("go" in "django").
    for alias in sorted(_ALIAS_TO_LANGUAGE, key=len, reverse=True):
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", text):
            return _ALIAS_TO_LANGUAGE[alias]
    return None


def language_manifest(language: str | None) -> str | None:
    """The ecosystem's dependency manifest filename ("requirements.txt", "go.mod"),
    or None when the language has no profile."""
    language_id = resolve_language_id(language)
    if language_id is None:
        return None
    return LANGUAGE_AGENT_PROFILES[language_id]["manifest"]


def specialist_catalog() -> str:
    """Compact, human-readable list of the ecosystems with a dedicated specialist
    agent — injected into planning prompts (Orchestrator/Architect) so stack
    decisions land where the factory is strongest, without forbidding others."""
    return ", ".join(
        f"{lang} ({profile['label']})" for lang, profile in LANGUAGE_AGENT_PROFILES.items()
    )


def ecosystem_brief(language: str | None, framework: str | None = None) -> str:
    """Role-agnostic ecosystem knowledge block for PLANNING engines (PromptMaster
    author, Architect): the same specialist rules the builder agents receive, so
    documents and blueprints describe the real ecosystem instead of generic prose.
    "" when the language has no profile (graceful fallback)."""
    language_id = resolve_language_id(language)
    if language_id is None:
        return ""
    profile = LANGUAGE_AGENT_PROFILES[language_id]
    framework_line = f"Framework alvo: {framework}.\n" if framework else ""
    return (
        f'<ecosystem_knowledge language="{language_id}" label="{profile["label"]}">\n'
        f"Conhecimento do ecossistema desta stack (use-o para descrever backend, testes, "
        f"estrutura de pastas e arquivos esperados com fidelidade — nunca generico):\n"
        f"{framework_line}{profile['backend_rules']}\n\n{profile['ecosystem_notes']}\n"
        "</ecosystem_knowledge>"
    )


def language_specialist_block(role: str, language: str | None, framework: str | None = None) -> str:
    """The `<language_specialist>` prompt block for a role, or "" when the role
    is not language-aware or the language has no profile (graceful fallback)."""
    if role not in LANGUAGE_AWARE_ROLES:
        return ""
    language_id = resolve_language_id(language)
    if language_id is None:
        return ""
    profile = LANGUAGE_AGENT_PROFILES[language_id]
    framework_line = f"Framework alvo: {framework}.\n" if framework else ""
    if role == "backend" or role == "repair":
        body = f"{framework_line}{profile['backend_rules']}\n\n{profile['ecosystem_notes']}"
    else:  # qa / devops / docs need the toolchain, not the code-layout rules
        body = f"{framework_line}{profile['ecosystem_notes']}"
    return (
        f'<language_specialist language="{language_id}" label="{profile["label"]}">\n'
        f"Voce atua como {profile['label']} deste projeto. Regras especificas do ecossistema (NAO-NEGOCIAVEIS):\n"
        f"{body}\n"
        "</language_specialist>"
    )
