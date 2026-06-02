from __future__ import annotations

from collections.abc import Sequence

from app.data.foundation import LOCALES, STACKS, TEMPLATES


class CatalogRepository:
    def list_stacks(self) -> Sequence[dict]:
        return STACKS

    def get_stack(self, stack_id: str) -> dict | None:
        return next((stack for stack in STACKS if stack["id"] == stack_id), None)

    def list_templates(self) -> Sequence[dict]:
        return TEMPLATES

    def list_locales(self) -> Sequence[dict]:
        return LOCALES
