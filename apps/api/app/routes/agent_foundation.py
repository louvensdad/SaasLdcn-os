from __future__ import annotations

from fastapi import APIRouter

from app.engines.agent_foundation_engine import get_agent_foundation_status
from app.schemas.agent_foundation import AgentFoundationStatus

router = APIRouter(tags=["agent-foundation"])


@router.get("/agents/foundation", response_model=AgentFoundationStatus)
def get_agents_foundation() -> AgentFoundationStatus:
    return get_agent_foundation_status()