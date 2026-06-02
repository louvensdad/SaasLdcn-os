from __future__ import annotations

from fastapi import APIRouter

from app.schemas.stack import Stack
from app.services.catalog_service import CatalogService


router = APIRouter(tags=["stacks"])
service = CatalogService()


@router.get("/stacks", response_model=list[Stack])
def list_stacks() -> list[Stack]:
    return [Stack.model_validate(item) for item in service.list_stacks()]


@router.get("/stacks/{stack_id}", response_model=Stack)
def get_stack(stack_id: str) -> Stack:
    return Stack.model_validate(service.get_stack(stack_id))
