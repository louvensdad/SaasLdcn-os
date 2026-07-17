from __future__ import annotations

from sqlalchemy import Boolean, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LlmUsageRecord(Base):
    """One row per LLM router response -- real usage telemetry (tokens straight
    from the provider's usage block, wall-clock latency, cost from the model
    registry's per-MTok prices). Feeds GET /api/llm/usage/stats; recording is
    fault-isolated so a telemetry failure can never break generation."""

    __tablename__ = "llm_usage_records"
    __table_args__ = (
        Index("idx_llm_usage_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    served_by_cache: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
