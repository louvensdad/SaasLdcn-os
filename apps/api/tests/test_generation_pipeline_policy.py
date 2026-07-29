from app.engines.generation_pipeline_policy import STEPS, logical_stages_for, steps_for


def test_web_pipeline_reuses_immutable_canonical_policy() -> None:
    assert steps_for("web") is STEPS
    assert isinstance(STEPS, list)
    assert "mobile" not in logical_stages_for(STEPS)


def test_mobile_policy_is_inserted_after_frontend_validation() -> None:
    steps = steps_for("full_stack")
    frontend_index = next(index for index, step in enumerate(steps) if step.state == "FRONTEND_VALIDATING")
    assert steps[frontend_index + 1].state == "MOBILE_PLANNING"
    assert steps[frontend_index + 2].chunk == "structure"
    assert "mobile" in logical_stages_for(steps)


def test_unknown_delivery_type_cannot_enable_mobile_pipeline() -> None:
    assert steps_for("desktop") is STEPS
    assert steps_for(None) is STEPS