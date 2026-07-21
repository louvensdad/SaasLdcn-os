from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.marketplace import (
    MarketplaceInstall,
    MarketplaceItem,
    PublishMarketplaceItemRequest,
    RepublishMarketplaceItemRequest,
)
from app.services.marketplace_service import MarketplaceSourceGoneError, marketplace_service

router = APIRouter(tags=["marketplace"])


@router.post("/marketplace/items", response_model=MarketplaceItem, status_code=status.HTTP_201_CREATED)
def publish_marketplace_item(payload: PublishMarketplaceItemRequest, user: CurrentUser) -> MarketplaceItem:
    item = marketplace_service.publish(author_user_id=user["user_id"], **payload.model_dump())
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automação de origem não encontrada.")
    return MarketplaceItem.model_validate(item)


@router.get("/marketplace/items", response_model=list[MarketplaceItem])
def list_marketplace_catalog(search: str | None = None) -> list[MarketplaceItem]:
    return [MarketplaceItem.model_validate(row) for row in marketplace_service.list_catalog(search=search)]


@router.get("/marketplace/items/mine", response_model=list[MarketplaceItem])
def list_my_marketplace_items(user: CurrentUser) -> list[MarketplaceItem]:
    return [MarketplaceItem.model_validate(row) for row in marketplace_service.list_mine(user["user_id"])]


@router.get("/marketplace/items/{item_id}", response_model=MarketplaceItem)
def get_marketplace_item(item_id: str, user: CurrentUser) -> MarketplaceItem:
    item = marketplace_service.get_detail(item_id, user["user_id"])
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item do marketplace não encontrado.")
    return MarketplaceItem.model_validate(item)


@router.post("/marketplace/items/{item_id}/archive", response_model=MarketplaceItem)
def archive_marketplace_item(item_id: str, user: CurrentUser) -> MarketplaceItem:
    item = marketplace_service.archive(item_id, user["user_id"])
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item do marketplace não encontrado.")
    return MarketplaceItem.model_validate(item)


@router.post("/marketplace/items/{item_id}/republish", response_model=MarketplaceItem)
def republish_marketplace_item(item_id: str, payload: RepublishMarketplaceItemRequest, user: CurrentUser) -> MarketplaceItem:
    try:
        item = marketplace_service.republish(item_id, user["user_id"], note=payload.note)
    except MarketplaceSourceGoneError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item do marketplace não encontrado.")
    return MarketplaceItem.model_validate(item)


@router.post("/marketplace/items/{item_id}/install", response_model=MarketplaceInstall, status_code=status.HTTP_201_CREATED)
def install_marketplace_item(item_id: str, user: CurrentUser) -> MarketplaceInstall:
    install = marketplace_service.install(item_id, user["user_id"])
    if install is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item do marketplace não encontrado ou não publicado.")
    return MarketplaceInstall.model_validate(install)


@router.get("/marketplace/installs/mine", response_model=list[MarketplaceInstall])
def list_my_marketplace_installs(user: CurrentUser) -> list[MarketplaceInstall]:
    return [MarketplaceInstall.model_validate(row) for row in marketplace_service.list_my_installs(user["user_id"])]


@router.post("/marketplace/installs/{install_id}/uninstall", response_model=MarketplaceInstall)
def uninstall_marketplace_item(install_id: str, user: CurrentUser) -> MarketplaceInstall:
    install = marketplace_service.uninstall(install_id, user["user_id"])
    if install is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instalação não encontrada.")
    return MarketplaceInstall.model_validate(install)
