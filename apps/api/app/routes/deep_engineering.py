from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.engines.deep_engineering_engine import deep_engineering_engine
from app.schemas.deep_engineering import DeepAnalyzeRequest, DeepEngineeringAnalysis

router = APIRouter(tags=["deep-engineering"])


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


@router.post("/deep-engineering/analyze", response_model=DeepEngineeringAnalysis)
def analyze(payload: DeepAnalyzeRequest) -> DeepEngineeringAnalysis:
    """Synchronous deep analysis — the full engineering reasoning in one response.
    Used by surfaces that render the analysis without a live thinking animation."""
    return DeepEngineeringAnalysis.model_validate(
        deep_engineering_engine.analyze(payload.spec, payload.blueprint)
    )


@router.post("/deep-engineering/analyze/stream")
def analyze_stream(payload: DeepAnalyzeRequest) -> StreamingResponse:
    """Stream the analysis stage-by-stage with a deliberate pace, so the UI shows
    the system genuinely thinking through the project before generating."""

    def event_source():
        for event in deep_engineering_engine.iter_deep_analysis(
            payload.spec, payload.blueprint, pace=payload.pace
        ):
            yield _sse(event)
        yield _sse({"type": "done"})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
