from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

ModelStrategy = Literal["economy", "balanced", "premium"]
ExecutionProfileId = Literal["economy", "professional", "enterprise"]


class ExecutionProfile(BaseModel):
    id: ExecutionProfileId
    name: str
    description: str
    model_strategy: ModelStrategy
    max_repair_cycles: int
    enable_architecture_review: bool
    enable_security_review: bool
    enable_performance_review: bool
    enable_import_graph: bool
    enable_dependency_graph: bool
    enable_build_guarantee: bool
    enable_product_certification: bool
    enable_accessibility_review: bool
    enable_runtime_validation: bool
    enable_cost_optimization: bool
    enable_deep_project_planning: bool
    recommended: bool = False


class ExecutionProfileSummary(BaseModel):
    id: ExecutionProfileId
    name: str
    description: str
    recommended: bool = False
