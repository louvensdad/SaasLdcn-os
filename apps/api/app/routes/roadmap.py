from __future__ import annotations

from fastapi import APIRouter

from app.engines.roadmap_engine import RoadmapEngine
from app.schemas.roadmap import RoadmapResponse

router = APIRouter(tags=["roadmap"])
engine = RoadmapEngine()


@router.get("/roadmap", response_model=RoadmapResponse)
def get_roadmap() -> RoadmapResponse:
    return RoadmapResponse.model_validate(engine.roadmap())
