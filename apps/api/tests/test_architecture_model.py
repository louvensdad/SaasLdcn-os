from __future__ import annotations

from app.engines.architect_engine import build_blueprint
from app.engines.architecture_model_engine import build_architecture_model
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _room_with_blueprint(*, with_payments: bool = False) -> dict:
    entities = ["Paciente", "Profissional", "Agendamento"]
    if with_payments:
        entities.append("Pagamento")
    spec = ProjectSpec(
        raw_intent="SaaS para clínica",
        product_summary="Gestão de clínica",
        system_type="SaaS de saúde",
        target_users=["Admin", "Médico"],
        entities=entities,
        business_rules=["RBAC", "LGPD"],
        non_functional={"performance": "p95 < 300ms"} if with_payments else {},
        suggested_stack=SuggestedStack(language="python", framework="fastapi"),
    )
    blueprint = build_blueprint(spec, project_id="room_x")
    return {"room_id": "room_x", "spec": spec.model_dump(mode="json"), "architecture_blueprint": blueprint.model_dump(mode="json")}


def test_model_is_none_without_blueprint():
    assert build_architecture_model({"room_id": "r", "spec": {}}) is None


def test_bounded_contexts_billing_only_with_payment_evidence():
    no_pay = build_architecture_model(_room_with_blueprint(with_payments=False))
    pay = build_architecture_model(_room_with_blueprint(with_payments=True))
    assert all(c["name"] != "Billing" for c in no_pay["bounded_contexts"])  # never invented
    assert any(c["name"] == "Billing" for c in pay["bounded_contexts"])  # real payment entity


def test_dependencies_and_strategies_are_grounded():
    model = build_architecture_model(_room_with_blueprint())
    # Dependencies are taken from the real decision.dependencies.
    modules = {d["module"] for d in model["dependencies"]}
    assert "backend" in modules
    # Deploy strategy is available because the blueprint decided deploy.
    assert model["deploy_strategy"]["available"] is True
    # DR available because a database was decided.
    assert model["disaster_recovery"]["available"] is True


def test_deep_decision_confidence_is_derived_not_fixed():
    spec = _room_with_blueprint()["spec"]
    blueprint = build_blueprint(ProjectSpec.model_validate(spec), project_id="room_x")
    confidences = {d.area: d.confidence for d in blueprint.decisions}
    # Optional/conditional integrations decision is honestly less certain than database.
    assert confidences["database"] > confidences["integrations"]
    assert all(0.0 < d.confidence <= 0.99 for d in blueprint.decisions)
    assert all(d.confidence_basis for d in blueprint.decisions)
    assert all("qualitativa" in d.cost_impact for d in blueprint.decisions)
