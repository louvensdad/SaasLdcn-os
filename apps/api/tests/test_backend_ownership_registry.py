from __future__ import annotations

import pytest

from app.engines.backend_ownership_registry import CHUNK_SCOPE_DESCRIPTIONS, infer_owner_chunk
from app.engines.generation_pipeline_policy import BACKEND_CHUNKS


@pytest.mark.parametrize(
    "path,expected",
    [
        ("backend/app/domain/entities/user.py", "domain_entities"),
        ("backend/src/main/java/com/app/domain/model/Usuario.java", "domain_entities"),
        ("backend/app/schemas/user_dto.py", "dtos"),
        ("backend/src/main/java/com/app/application/dto/RegisterRequest.java", "dtos"),
        ("backend/src/main/java/com/app/interface_/controller/AuthController.java", "controllers"),
        ("backend/app/api/routes/users.py", "controllers"),
        ("backend/src/main/java/com/app/application/usecase/RegistrarUsuarioUseCase.java", "services"),
        ("backend/app/services/auth_service.py", "services"),
        ("backend/src/main/java/com/app/domain/repository/UsuarioRepository.java", "repositories"),
        ("backend/app/repositories/user_repository.py", "repositories"),
        ("backend/src/main/java/com/app/infrastructure/security/JwtTokenAdapter.java", "auth"),
        ("backend/app/core/security.py", "auth"),
        ("backend/app/validators/email_validator.py", "validation"),
        ("backend/src/main/java/com/app/domain/exception/DomainException.java", "error_handling"),
        ("backend/app/exceptions.py", "error_handling"),
        ("backend/src/test/java/com/app/application/usecase/RegistrarUsuarioUseCaseTest.java", "tests"),
        ("backend/tests/test_auth_service.py", "tests"),
        ("backend/openapi.yaml", "openapi_sync"),
        ("backend/requirements.txt", "package_config"),
        ("backend/pom.xml", "package_config"),
        ("backend/app/main.py", "structure"),
        ("backend/CadastroUsuarioApplication.java", "structure"),
    ],
)
def test_infer_owner_chunk(path: str, expected: str) -> None:
    assert infer_owner_chunk(path) == expected


def test_every_backend_chunk_has_a_scope_description() -> None:
    for chunk in BACKEND_CHUNKS:
        assert chunk in CHUNK_SCOPE_DESCRIPTIONS, f"missing scope description for chunk '{chunk}'"
        assert CHUNK_SCOPE_DESCRIPTIONS[chunk].strip()
