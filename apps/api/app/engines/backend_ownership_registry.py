from __future__ import annotations

from app.engines.generation_pipeline_policy import BACKEND_CHUNKS

# Infers which BACKEND_CHUNKS responsibility a generated file path *should*
# belong to, from the path alone -- used by the semantic merge check (PARTE 5
# of the request) to catch a chunk emitting a file well outside its declared
# scope (e.g. the "services" chunk emitting a JwtTokenAdapter that belongs to
# "auth"). Order matters: more specific responsibility signals are checked
# before the generic "structure" fallback.

_TEST_MARKERS = ("/test/", "/tests/", "/__tests__/", "/spec/")


def infer_owner_chunk(path: str) -> str:
    name = path.replace("\\", "/").lower()
    basename = name.rsplit("/", 1)[-1]

    if any(marker in name for marker in _TEST_MARKERS) or basename.startswith("test_") or any(
        basename.endswith(suffix) for suffix in ("test.java", "test.py", "_test.py", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")
    ):
        return "tests"
    if "openapi" in basename or basename in {"openapi.yaml", "openapi.yml", "openapi.json"}:
        return "openapi_sync"
    if any(token in name for token in ("/auth/", "jwt", "oauth")) or "authent" in name or "security" in name:
        return "auth"
    if "/validation/" in name or "validator" in basename:
        return "validation"
    if "exception" in basename or "errorhandler" in basename or "/error/" in name or "error_handling" in name:
        return "error_handling"
    if any(token in name for token in ("/repository/", "/repositories/", "/persistence/")) or basename.endswith(("repository.java", "repository.py")):
        return "repositories"
    if any(token in name for token in ("/controller/", "/controllers/", "/routes/", "/routers/", "/interface/", "/interfaceadapter/")) or basename.endswith("controller.java"):
        return "controllers"
    if any(token in name for token in ("/dto/", "/dtos/", "/schema/", "/schemas/")) or basename.endswith(("request.java", "response.java", "dto.java")):
        return "dtos"
    if any(token in name for token in ("/service/", "/services/", "/usecase/", "/use_case/", "/application/")) or basename.endswith(("service.java", "usecase.java", "service.py")):
        return "services"
    if any(token in name for token in ("/domain/", "/entity/", "/entities/", "/model/", "/models/")):
        return "domain_entities"
    if basename in {"requirements.txt", "pom.xml", "package.json", "pyproject.toml", "cargo.toml", "go.mod"} or basename.endswith(".gradle") or basename.endswith(".gradle.kts"):
        return "package_config"
    return "structure"


assert set(BACKEND_CHUNKS) >= {
    "tests", "openapi_sync", "auth", "validation", "error_handling",
    "repositories", "controllers", "services", "dtos", "domain_entities",
    "package_config", "structure",
}, "infer_owner_chunk targets must stay a subset of BACKEND_CHUNKS"

# Explicit per-chunk scope boundary, injected into that chunk's LLM context
# (see PARTE 5 of the request: "cada agente deve gerar somente o escopo que
# lhe pertence"). Calibrated against a real 691-artifact historical job
# (genjob_3be298b1d64b42): the pipeline already told each chunk "generate
# only this chunk's files, don't repeat other chunks' files" (a bare chunk
# NAME with no definition of what it means) -- cross-referencing real
# per-chunk attribution against path-based inference showed a 66% mismatch
# rate, with "structure" and "package_config" chunks emitting complete,
# independent domain entities/services/controllers/auth adapters that the
# domain_entities/services/controllers/auth chunks ALSO independently
# generated for the same entities -- the actual root cause of the 6-way file
# duplication the Architecture Consolidation Gate had to clean up after the
# fact. Each description below states both what the chunk owns and what it
# must NOT regenerate.
CHUNK_SCOPE_DESCRIPTIONS: dict[str, str] = {
    "structure": (
        "Apenas diretorios, arquivos de manifest vazios/esqueleto e contratos estruturais "
        "(ex.: classe de entrypoint da aplicacao vazia, esqueleto de pastas). "
        "NAO gere entidades de dominio, services, repositories, controllers, adapters de auth "
        "ou testes -- esses pertencem aos chunks domain_entities/services/repositories/"
        "controllers/auth/tests."
    ),
    "package_config": (
        "Apenas arquivos de gerenciamento de dependencias e configuracao de build "
        "(requirements.txt/pom.xml/package.json/build.gradle, .env.example, application.yml). "
        "NAO gere codigo de dominio, services, repositories, controllers ou auth."
    ),
    "domain_entities": "Apenas entidades de dominio (classes/modelos que representam o dominio de negocio). NAO gere DTOs, controllers, services ou repositories.",
    "dtos": "Apenas DTOs e schemas de entrada/saida (request/response). NAO gere entidades de dominio, controllers ou services.",
    "controllers": "Apenas rotas e controllers (a camada HTTP fina que delega para services). NAO reimplemente services, repositories, entidades de dominio ou adapters de auth.",
    "services": "Apenas casos de uso e servicos de aplicacao (orquestram entidades/repositories ja existentes). NAO redefina entidades de dominio, repositories ou controllers.",
    "repositories": "Apenas interfaces e implementacoes de persistencia. NAO gere entidades de dominio, services ou controllers.",
    "auth": "Apenas autenticacao e autorizacao (JWT/OAuth/security config/password hashing). NAO reimplemente controllers, services ou repositories que nao sejam estritamente de auth.",
    "validation": "Apenas validacoes e regras transversais (validators, cross-cutting rules). NAO gere entidades, services ou controllers.",
    "error_handling": "Apenas excecoes de dominio/aplicacao e o handler global de excecoes. NAO gere controllers, services ou entidades.",
    "tests": "Apenas testes. NAO gere codigo de producao novo -- os arquivos testados ja existem nos chunks anteriores.",
    "openapi_sync": "Apenas sincronizacao do contrato OpenAPI com o codigo gerado (nao regenerar codigo de aplicacao).",
}
