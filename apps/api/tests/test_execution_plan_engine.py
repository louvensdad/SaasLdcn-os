from __future__ import annotations

from app.engines.execution_plan_engine import build_execution_plan
from app.engines.generation_job_engine import logical_stages_for, steps_for


def test_web_plan_matches_the_real_stage_list_and_has_no_mobile_phase():
    stages = logical_stages_for(steps_for("web"))
    plan = build_execution_plan("web", stages)
    assert [p.id for p in plan.phases] == stages
    assert "mobile" not in [p.id for p in plan.phases]


def test_full_stack_plan_includes_mobile_in_the_real_splice_position():
    stages = logical_stages_for(steps_for("full_stack"))
    plan = build_execution_plan("full_stack", stages)
    ids = [p.id for p in plan.phases]
    assert ids == stages
    assert ids.index("mobile") == ids.index("frontend") + 1
    assert ids.index("mobile") < ids.index("security")


def test_every_known_stage_has_a_complete_non_placeholder_definition():
    stages = logical_stages_for(steps_for("full_stack"))  # covers all 10 known stages
    plan = build_execution_plan("full_stack", stages)
    assert len(plan.phases) == 10
    for phase in plan.phases:
        assert phase.label
        assert phase.objective
        assert phase.expected_input
        assert phase.expected_output
        assert phase.risk
        assert phase.approval_criteria
        assert "Não documentado" not in phase.expected_input
        assert "Não documentado" not in phase.expected_output


def test_unknown_stage_id_falls_back_instead_of_crashing():
    plan = build_execution_plan("web", ["totally_unknown_stage"])
    assert len(plan.phases) == 1
    assert plan.phases[0].id == "totally_unknown_stage"
    assert plan.phases[0].objective  # fallback text, not empty
