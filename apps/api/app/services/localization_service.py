from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR

SUPPORTED_LOCALES = ("pt-BR", "en-US", "es-ES", "fr-FR")
FALLBACK_LOCALE = "pt-BR"
LOCALE_DEFINITIONS = (
    {"code": "pt-BR", "language": "Português", "name": "Portuguese (Brazil)", "native_name": "Português", "is_default": True, "direction": "ltr"},
    {"code": "en-US", "language": "English", "name": "English (United States)", "native_name": "English", "is_default": False, "direction": "ltr"},
    {"code": "es-ES", "language": "Español", "name": "Spanish (Spain)", "native_name": "Español", "is_default": False, "direction": "ltr"},
    {"code": "fr-FR", "language": "Français", "name": "French (France)", "native_name": "Français", "is_default": False, "direction": "ltr"},
)


class LocalizationService:
    def __init__(self, dictionaries_root: Path | None = None) -> None:
        self.dictionaries_root = dictionaries_root or BASE_DIR.parents[1] / "apps" / "web" / "lib" / "i18n" / "dictionaries"

    def locales(self) -> list[dict[str, Any]]:
        return [dict(item) for item in LOCALE_DEFINITIONS]

    def dictionary(self, locale: str, fallback_locale: str = FALLBACK_LOCALE) -> dict[str, Any]:
        requested = self._validate_locale(locale)
        fallback = self._validate_locale(fallback_locale)
        fallback_entries = self._load(fallback)
        requested_entries = self._load(requested)
        missing = sorted(set(fallback_entries) - set(requested_entries))
        return {
            "dictionary_id": f"ldcn-{requested}",
            "locale": requested,
            "namespace": "common",
            "entries": {**fallback_entries, **requested_entries},
            "fallback_locale": fallback,
            "missing_keys": missing,
        }

    def preview(self, locale: str, key: str, values: dict[str, Any], fallback_locale: str = FALLBACK_LOCALE) -> dict[str, Any]:
        dictionary = self.dictionary(locale, fallback_locale)
        requested_entries = self._load(locale)
        if key not in dictionary["entries"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Translation key '{key}' was not found.")
        text = dictionary["entries"][key]
        for name, value in values.items():
            text = text.replace(f"{{{{{name}}}}}", str(value))
        return {
            "requested_locale": locale,
            "resolved_locale": locale if key in requested_entries else fallback_locale,
            "key": key,
            "text": text,
            "used_fallback": key not in requested_entries,
        }

    def validate(self, locale: str, required_keys: list[str], fallback_locale: str = FALLBACK_LOCALE) -> dict[str, Any]:
        requested = self._load(self._validate_locale(locale))
        fallback = self._load(self._validate_locale(fallback_locale))
        keys = required_keys or sorted(fallback)
        missing = sorted(key for key in keys if key not in requested and key not in fallback)
        fallback_keys = sorted(key for key in keys if key not in requested and key in fallback)
        return {
            "locale": locale,
            "valid": not missing,
            "total_keys": len(keys),
            "missing_keys": missing,
            "fallback_keys": fallback_keys,
        }

    def profile(self, selected_locale: str, fallback_locale: str = FALLBACK_LOCALE) -> dict[str, str]:
        selected = self._validate_locale(selected_locale)
        fallback = self._validate_locale(fallback_locale)
        return {
            "selected_locale": selected,
            "fallback_locale": fallback,
            "generated_docs_locale": selected,
            "generated_readme_locale": selected,
            "generated_comments_locale": selected,
        }

    def _load(self, locale: str) -> dict[str, str]:
        path = self.dictionaries_root / f"{locale}.json"
        if not path.is_file():
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Dictionary '{locale}' was not found.")
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _validate_locale(locale: str) -> str:
        if locale not in SUPPORTED_LOCALES:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Locale '{locale}' is not supported.")
        return locale
