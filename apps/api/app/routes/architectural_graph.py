from __future__ import annotations

from fastapi import APIRouter

from app.engines.architectural_graph_engine import generate_architectural_graph
from app.schemas.architectural_graph import ArchitecturalGraph, ArchitecturalGraphRequest

router = APIRouter(tags=["architectural-graph"])


@router.post("/architectural-graph/preview", response_model=ArchitecturalGraph)
def preview_architectural_graph(payload: ArchitecturalGraphRequest) -> ArchitecturalGraph:
    return ArchitecturalGraph.model_validate(generate_architectural_graph(payload.model_dump()))
