from __future__ import annotations

from typing import Any

from app.repositories.feature_repository import FeatureRepository

# Feature lifecycle (vault 63 - Domain Model/Ciclos de vida das entidades.md):
# Proposed -> Planned -> In Progress -> In Review -> Accepted -> Released -> Deprecated.
# The vault lists the sequence but doesn't specify transition rules beyond it --
# forward-only through the sequence (no skipping, no going back) is the
# straightforward reading, plus "Deprecated" reachable from any non-terminal
# state (a feature can be abandoned at any point, matching how ChangeRequest's
# own lifecycle allows a Rejected/Rolled Back exit from most states).

_SEQUENCE = ["Proposed", "Planned", "In Progress", "In Review", "Accepted", "Released"]
_TERMINAL = frozenset({"Released", "Deprecated"})


class FeatureTransitionError(ValueError):
    def __init__(self, message: str, *, current_status: str, allowed: list[str]) -> None:
        super().__init__(message)
        self.current_status = current_status
        self.allowed = allowed


def allowed_next_statuses(current_status: str) -> list[str]:
    if current_status in _TERMINAL:
        return []
    try:
        index = _SEQUENCE.index(current_status)
    except ValueError:
        return []
    allowed = ["Deprecated"]
    if index + 1 < len(_SEQUENCE):
        allowed.insert(0, _SEQUENCE[index + 1])
    return allowed


class FeatureService:
    def __init__(self, repository: FeatureRepository | None = None) -> None:
        self.repository = repository or FeatureRepository()

    def create(self, **kwargs: Any) -> dict[str, Any]:
        return self.repository.create(**kwargs)

    def get(self, feature_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.get_for_owner(feature_id, owner_user_id)

    def list_for_project(self, project_id: str, owner_user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_for_project(project_id, owner_user_id)

    def delete(self, feature_id: str, owner_user_id: str) -> bool:
        return self.repository.delete_for_owner(feature_id, owner_user_id)

    def transition(self, feature_id: str, owner_user_id: str, new_status: str) -> dict[str, Any] | None:
        feature = self.repository.get_for_owner(feature_id, owner_user_id)
        if feature is None:
            return None
        allowed = allowed_next_statuses(feature["status"])
        if new_status not in allowed:
            raise FeatureTransitionError(
                f"Não é possível mover de '{feature['status']}' para '{new_status}'.",
                current_status=feature["status"], allowed=allowed,
            )
        return self.repository.set_status(feature_id, owner_user_id, new_status)


feature_service = FeatureService()
