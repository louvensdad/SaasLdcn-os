from __future__ import annotations

from collections.abc import Sequence
import re

from fastapi import HTTPException, status

from app.repositories.catalog_repository import CatalogRepository

STACK_ID_PATTERN = re.compile(r"^[a-z]+(?:_[a-z]+)*$")


class CatalogService:
    def __init__(self, repository: CatalogRepository | None = None) -> None:
        self.repository = repository or CatalogRepository()

    def list_stacks(self) -> Sequence[dict]:
        stacks = self.repository.list_stacks()
        if not stacks:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No stacks are configured.",
            )
        return stacks

    def get_stack(self, stack_id: str) -> dict:
        if not STACK_ID_PATTERN.fullmatch(stack_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stack '{stack_id}' was not found.",
            )

        stack = self.repository.get_stack(stack_id)
        if stack is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stack '{stack_id}' was not found.",
            )
        return stack

    def list_templates(self) -> Sequence[dict]:
        templates = self.repository.list_templates()
        if not templates:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No templates are configured.",
            )
        return templates
