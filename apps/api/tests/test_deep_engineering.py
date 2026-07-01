from __future__ import annotations

from app.engines.deep_engineering_engine import DeepEngineeringEngine
from app.schemas.orchestrator import ProjectSpec

_SPEC_DICT = {
    "raw_intent": "Sistema de agendamento para clínica",
    "product_summary": "Agenda de consultas para uma clínica com pacientes e médicos.",
    "system_type": "web app",
    "target_users": ["Recepcionista", "Médico", "Paciente"],
    "business_rules": [
        "Apenas a recepção pode remarcar uma consulta.",
        "Proteger dados pessoais dos pacientes conforme a LGPD.",
    ],
    "entities": ["Paciente", "Médico", "Consulta", "Sala"],
    "core_workflows": ["Agendar consulta", "Cancelar consulta"],
    "non_functional": {"seguranca": "JWT", "disponibilidade": "99.9%"},
    "suggested_stack": {
        "language": "Python",
        "language_reason": "Produtividade e ecossistema maduro.",
        "runtime": "CPython",
        "framework": "FastAPI",
        "framework_reason": "Performance e contratos tipados.",
        "architecture": "Modular monolith",
        "architecture_reason": "Isola domínio sem complexidade de microsserviços.",
    },
    "confidence": 0.8,
}


def _spec() -> ProjectSpec:
    return ProjectSpec.model_validate(_SPEC_DICT)


def test_analysis_is_derived_from_real_spec():
    engine = DeepEngineeringEngine(min_stage_seconds=0)
    analysis = engine.analyze(_spec())

    assert analysis["entity_count"] == 4
    # 5 CRUD endpoints per entity + one per workflow.
    assert analysis["endpoint_count"] == 4 * 5 + 2
    assert analysis["workflow_count"] == 2
    assert analysis["rule_count"] == 2
    assert analysis["component_count"] > 0

    stage_ids = [s["id"] for s in analysis["stages"]]
    assert stage_ids == [
        "requirements", "architecture", "domain_data", "api_surface",
        "security", "risk_complexity", "build_plan", "validation_criteria",
    ]
    # Every stage has substance.
    assert all(s["details"] for s in analysis["stages"])


def test_architecture_decisions_have_rationale_and_alternatives():
    analysis = DeepEngineeringEngine(min_stage_seconds=0).analyze(_spec())
    decisions = {d["decision"]: d for d in analysis["decisions"]}
    assert any("FastAPI" in d for d in decisions)
    arch = next(d for d in analysis["decisions"] if d["decision"].startswith("Arquitetura"))
    assert arch["rationale"]
    assert arch["alternatives"]
    assert arch["trade_offs"]


def test_sensitive_domain_raises_security_and_risk():
    analysis = DeepEngineeringEngine(min_stage_seconds=0).analyze(_spec())
    # LGPD rule -> a privacy/audit security consideration is surfaced.
    assert any("LGPD" in c for c in analysis["security_considerations"])
    assert analysis["risk_level"] in {"medium", "high"}
    assert analysis["validation_criteria"]


def test_iter_deep_analysis_streams_stages_then_sentinel():
    engine = DeepEngineeringEngine(min_stage_seconds=0)
    events = list(engine.iter_deep_analysis(_spec(), pace=False))
    started = [e for e in events if e["type"] == "deep_stage_started"]
    completed = [e for e in events if e["type"] == "deep_stage_completed"]
    assert len(started) == 8 and len(completed) == 8
    assert events[-1]["type"] == "deep_analysis"
    assert events[-1]["analysis"]["entity_count"] == 4


def test_empty_spec_does_not_crash():
    spec = ProjectSpec.model_validate({"raw_intent": "algo simples"})
    analysis = DeepEngineeringEngine(min_stage_seconds=0).analyze(spec)
    assert analysis["entity_count"] == 0
    assert analysis["complexity"] in {"Indefinida", "Baixa"}
    assert len(analysis["stages"]) == 8


def test_deep_analyze_route(client):
    response = client.post(
        "/api/deep-engineering/analyze",
        json={"spec": _SPEC_DICT, "blueprint": None},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["entity_count"] == 4
    assert len(body["stages"]) == 8
    assert body["decisions"]


def test_analyze_codebase_is_derived_from_inventory_and_diagnosis():
    from app.schemas.modernize import (
        ArchitectureSmell,
        CodebaseInventory,
        Diagnosis,
        MigrationPlan,
        SecurityFinding,
    )

    inventory = CodebaseInventory(
        ingest_id="ingest_x", source="zip", file_count=42, total_bytes=512_000,
        languages={"python": 30, "yaml": 12},
    )
    diagnosis = Diagnosis(
        detected_stack="Python", primary_language="python", languages=["python", "yaml"],
        dependency_notes=["Flask 0.x detectado: versão muito antiga."],
        smells=[ArchitectureSmell(code="no_tests", message="Nenhuma suíte de testes detectada.")],
        security_findings=[SecurityFinding(severity="high", code="aws_access_key", message="Chave AWS embutida.", path="cfg.py", line=3)],
    )
    plan = MigrationPlan(target_architecture="Clean Architecture", preserved_logic_note="PRESERVAR", steps=["Extrair serviços"])

    analysis = DeepEngineeringEngine(min_stage_seconds=0).analyze_codebase(inventory, diagnosis, plan)
    ids = [s["id"] for s in analysis["stages"]]
    assert ids == ["inventory", "stack", "smells", "security", "dependencies", "risk_complexity", "build_plan", "validation_criteria"]
    assert analysis["component_count"] == 42
    assert analysis["risk_level"] in {"medium", "high"}  # a high finding + a smell
    assert any("aws_access_key" in c for c in analysis["security_considerations"])
    assert any("Flask" in d for s in analysis["stages"] if s["id"] == "dependencies" for d in s["details"])


def test_modernize_deep_analyze_stream_route(client):
    import io
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("app/controllers/user_controller.py", "password = 'supersecret123'\n")
        zf.writestr("requirements.txt", "flask==0.12\n")
    ingest = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("legacy.zip", buffer.getvalue(), "application/zip")},
    ).json()
    ingest_id = ingest["inventory"]["ingest_id"]

    response = client.post("/api/modernize/deep-analyze/stream", json={"ingest_id": ingest_id, "pace": False})
    assert response.status_code == 200
    lines = [ln for ln in response.text.splitlines() if ln.startswith("data: ")]
    assert any('"deep_stage_started"' in ln for ln in lines)
    assert any('"deep_analysis"' in ln for ln in lines)
    assert any('"id": "smells"' in ln for ln in lines)


def test_deep_analyze_stream_route_unpaced(client):
    response = client.post(
        "/api/deep-engineering/analyze/stream",
        json={"spec": _SPEC_DICT, "pace": False},
    )
    assert response.status_code == 200
    lines = [ln for ln in response.text.splitlines() if ln.startswith("data: ")]
    assert any('"deep_stage_started"' in ln for ln in lines)
    assert any('"deep_analysis"' in ln for ln in lines)
    assert lines[-1].endswith('{"type": "done"}') or '"done"' in lines[-1]
