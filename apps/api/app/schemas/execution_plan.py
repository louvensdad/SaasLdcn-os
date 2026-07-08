from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel

# Execution Plan Engine (Engineering Employee Mode, section 3): every phase of
# the real pipeline gets an objective/expected input/expected output/risk/
# approval-criteria description, instead of LOGICAL_STAGES/STEPS being purely
# technical routing with no planning metadata at all.


class ExecutionPlanPhase(ApiModel):
    id: str  # matches PipelineStep.logical exactly
    label: str
    objective: str
    expected_input: str
    expected_output: str
    risk: str
    approval_criteria: str


class ExecutionPlan(ApiModel):
    delivery_type: str
    phases: list[ExecutionPlanPhase] = Field(default_factory=list)
    generated_at: str
