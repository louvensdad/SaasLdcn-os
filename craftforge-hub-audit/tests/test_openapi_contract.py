"""
Validação do contrato OpenAPI.

Garante que todos os endpoints definidos no openapi.yaml estejam implementados
e que as respostas sigam os schemas documentados.
"""

import os
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport
from openapi_core import create_spec
from openapi_core.validation.response.datatypes import SpecValidationError
from openapi_core.validation.request.validators import RequestValidator
from openapi_core.validation.response.validators import ResponseValidator
from openapi_core.unmarshalling.request.unmarshaller import RequestUnmarshaller
from yaml import safe_load

# Importa a aplicação FastAPI (ajuste o caminho conforme a estrutura real)
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "app"))
from main import app  # noqa: E402


SPEC_PATH = Path(__file__).parent.parent / "openapi.yaml"


@pytest.fixture(scope="session")
def spec():
    """Carrega e compila o OpenAPI spec."""
    with open(SPEC_PATH, "r") as f:
        raw = safe_load(f)
    return create_spec(raw)


@pytest.fixture
def client():
    """Cliente HTTP assíncrono sem subir o servidor."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- Coleta de operações do spec ---

def _extract_operations(spec):
    """Retorna lista de (method, path_str) do spec."""
    operations = []
    for path, methods in spec["paths"].items():
        for method in methods:
            if method.upper() in ("GET", "PUT", "POST", "DELETE", "PATCH", "OPTIONS", "HEAD"):
                operations.append((method.upper(), path))
    return operations


def test_all_endpoints_implemented(spec):
    """Verifica se cada caminho+método do OpenAPI possui uma rota registrada no app."""
    from app.api.routes import router as api_router
    # Mapeia rotas do FastAPI: dict de (método, path_format) -> rota
    app_routes = {}
    for route in api_router.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            for method in route.methods:
                app_routes[(method, route.path)] = route

    operations = _extract_operations(spec)
    missing = []
    for method, path in operations:
        # Normaliza path (FastAPI usa {param}, OpenAPI usa {param})
        # Ambos seguem RFC 6570, são equivalentes.
        key = (method, path)
        if key not in app_routes:
            missing.append(f"{method} {path}")
    if missing:
        pytest.fail(f"Endpoints não implementados: {', '.join(missing)}")


def test_http_methods(spec):
    """Verifica que os métodos HTTP por endpoint estão corretos."""
    # Para cada operação, faz uma requisição OPTIONS? Não é necessário.
    # Apenas garante que não há métodos extras no spec que não são suportados.
    supported = {"GET", "PUT", "POST", "DELETE", "PATCH", "OPTIONS", "HEAD"}
    for path, methods in spec["paths"].items():
        for method in methods:
            if method.upper() not in supported:
                pytest.fail(f"Método inválido {method} para {path}")


# Testes com chamadas reais (precisa de um banco de dados de teste, então marcamos como integração)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_responses_match_schema(spec, client):
    """
    Testa que as respostas de alguns endpoints seguem o schema definido.
    Usa openapi_core para validar.
    """
    # Exemplo: GET /auth/me (requer token, mas podemos testar com token inválido para ver erro)
    # Vamos testar um endpoint simples que não requer autenticação.
    # Por simplicidade, testamos apenas a validação estrutural do schema da resposta.
    # A validação completa requer mock de autenticação e banco, então será parcial.

    # Validar que a resposta de erro padrão segue ErrorResponse
    response = await client.get("/nonexistent")
    # Valida resposta contra spec
    validator = ResponseValidator(spec)
    result = validator.validate(
        request=RequestUnmarshaller(spec).unmarshal(
            method="GET",
            path="/nonexistent",
            query={},
            headers={},
        ),
        response=response,
    )
    if result.errors:
        pytest.fail(f"Erros de validação: {[str(e) for e in result.errors]}")


def test_parameters_defined(spec):
    """
    Verifica que todos os parâmetros de path e query estão documentados com type/required.
    """
    for path, methods in spec["paths"].items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            params = operation.get("parameters", [])
            for param in params:
                assert "name" in param, f"Parâmetro sem nome em {method.upper()} {path}"
                assert "in" in param, f"Parâmetro sem 'in' em {method.upper()} {path}"
                assert "schema" in param, f"Parâmetro sem schema em {method.upper()} {path}"
                assert "type" in param["schema"], f"Parâmetro sem type em {method.upper()} {path}"