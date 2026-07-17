from __future__ import annotations

import json
from typing import Any

from app.repositories.user_preferences_repository import UserPreferencesRepository


class UserPreferencesService:
    def __init__(self, repository: UserPreferencesRepository | None = None) -> None:
        self.repository = repository or UserPreferencesRepository()

    def _get(self, user_id: str, column: str) -> dict[str, Any] | None:
        row = self.repository.get(user_id)
        value = row.get(column) if row else None
        return json.loads(value) if value else None

    def _set(self, user_id: str, column: str, data: dict[str, Any]) -> dict[str, Any] | None:
        setter = getattr(self.repository, 'set_' + column.removesuffix('_json'))
        setter(user_id, json.dumps(data))
        return self._get(user_id, column)

    def get_interface(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'interface_json')

    def set_interface(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'interface_json', data)

    def get_ai(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'ai_json')

    def set_ai(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'ai_json', data)

    def get_personal(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'personal_json')

    def set_personal(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'personal_json', data)

    def get_git(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'git_json')

    def set_git(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'git_json', data)

    def get_advanced(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'advanced_json')

    def set_advanced(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'advanced_json', data)

    def get_locale(self, user_id: str) -> dict[str, Any] | None:
        return self._get(user_id, 'locale_json')

    def set_locale(self, user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        return self._set(user_id, 'locale_json', data)


user_preferences_service = UserPreferencesService()