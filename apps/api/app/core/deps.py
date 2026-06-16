from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import TokenError, decode_token
from app.repositories.user_repository import UserRepository

_bearer_scheme = HTTPBearer(auto_error=False)

_user_repository = UserRepository()


def get_user_repository() -> UserRepository:
    return _user_repository


def configure_user_repository(repository: UserRepository) -> None:
    """Override the module-level user repository singleton.

    Used by the test suite to point `get_current_user` at an isolated,
    per-test SQLite database (mirrors how `ProjectService` repositories are
    swapped in `tests/conftest.py`).
    """
    global _user_repository
    _user_repository = repository


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> dict:
    """Resolve the authenticated user from the 'Authorization: Bearer <token>' header.

    Used as a FastAPI dependency, either per-route or globally via
    `app.include_router(..., dependencies=[Depends(get_current_user)])`.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or not credentials.credentials:
        raise unauthorized

    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = user_repository.get_by_id(payload["sub"])
    if user is None or not user["is_active"]:
        raise unauthorized
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_role(*roles: str):
    """Build a dependency that requires the current user to have one of `roles`."""

    def _dependency(user: CurrentUser) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return _dependency


RequireAdmin = Annotated[dict, Depends(require_role("admin"))]
