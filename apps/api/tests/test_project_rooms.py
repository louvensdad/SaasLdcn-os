from __future__ import annotations

import json
import threading
from uuid import uuid4

from fastapi.testclient import TestClient

MANDATORY_SECTION_TITLES = [
    "## Visao Geral",
    "## Objetivo do Projeto",
    "## Modulos",
    "## Usuarios",
    "## Permissoes",
    "## Regras de Negocio",
    "## Entidades",
    "## Seguranca",
    "## Autenticacao",
    "## Testes",
    "## Internacionalizacao",
    "## Criterios de Aceite",
    "## Regras de Geracao",
    "## O que NAO deve ser gerado",
]


def _ascii(value: str) -> str:
    return (
        value.replace("ã", "a")
        .replace("Ã", "A")
        .replace("ç", "c")
        .replace("Ç", "C")
        .replace("ó", "o")
        .replace("Ó", "O")
        .replace("í", "i")
        .replace("Í", "I")
        .replace("ú", "u")
        .replace("Ú", "U")
        .replace("õ", "o")
        .replace("Õ", "O")
        .replace("á", "a")
        .replace("Á", "A")
        .replace("é", "e")
        .replace("É", "E")
        .replace("â", "a")
        .replace("ê", "e")
    )



def _diagnostic(response) -> dict:
    payload = response.json()
    stack = [payload]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            if "endpoint_called" in current:
                return current
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    raise AssertionError(payload)
def _create_room(client: TestClient, title: str = "Sala de teste", raw_intent: str = "") -> dict:
    response = client.post("/api/project-rooms", json={"title": title, "raw_intent": raw_intent, "locale": "pt-BR"})
    assert response.status_code == 201, response.text
    return response.json()


def _register_second_user(client: TestClient) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"other_{uuid4().hex}@example.com",
            "password": "OtherPassword123!",
            "full_name": "Other User",
            "privacy_policy_accepted": True,
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["tokens"]["access_token"]


def _approved_prompt_room(client: TestClient) -> str:
    room = _create_room(client, raw_intent="quero um SaaS para clinica")
    room_id = room["room_id"]
    assert client.post(f"/api/project-rooms/{room_id}/generate-prompt").status_code == 200
    approved = client.post(f"/api/project-rooms/{room_id}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "PROMPT_APPROVED"
    return room_id


def _engineering_approved_room(client: TestClient) -> str:
    room_id = _approved_prompt_room(client)
    blueprint = client.post(f"/api/project-rooms/{room_id}/blueprint")
    assert blueprint.status_code == 200, blueprint.text
    review = client.post(f"/api/project-rooms/{room_id}/engineering-review")
    assert review.status_code == 200, review.text
    # In tests there is no LLM, so the Blueprint is deterministic (degraded) and must
    # be consciously acknowledged before the Engineering Review can be approved.
    ack = client.post(
        f"/api/project-rooms/{room_id}/acknowledge-preview",
        json={"confirmation": "CONTINUAR COM PREVIEW"},
    )
    assert ack.status_code == 200, ack.text
    final_approval = client.post(f"/api/project-rooms/{room_id}/approve")
    assert final_approval.status_code == 200, final_approval.text
    assert final_approval.json()["status"] == "ENGINEERING_APPROVED"
    # Stack Approval Gate: the Meta-Factory only starts on a user-approved stack.
    stack = client.post(f"/api/project-rooms/{room_id}/stack/approve", json={})
    assert stack.status_code == 200, stack.text
    return room_id


def test_create_project_room_starts_as_draft(client: TestClient) -> None:
    room = _create_room(client)
    assert room["status"] == "DRAFT"
    assert room["messages"] == []
    assert room["spec"] is None
    assert room["prompt_master_md"] is None


def test_create_project_room_defaults_delivery_type_to_web(client: TestClient) -> None:
    room = _create_room(client)
    assert room["delivery_type"] == "web"


def test_create_project_room_persists_chosen_delivery_type(client: TestClient) -> None:
    response = client.post(
        "/api/project-rooms",
        json={"title": "Mobile idea", "raw_intent": "", "locale": "pt-BR", "delivery_type": "mobile"},
    )
    assert response.status_code == 201, response.text
    room = response.json()
    assert room["delivery_type"] == "mobile"

    fetched = client.get(f"/api/project-rooms/{room['room_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["delivery_type"] == "mobile"


def test_orchestrator_turn_carries_room_delivery_type_into_spec(client: TestClient) -> None:
    # raw_intent is non-empty, so room creation immediately runs an orchestrator
    # turn and compiles a ProjectSpec -- the room's delivery_type (not something
    # the orchestrator infers) must land on that spec.
    response = client.post(
        "/api/project-rooms",
        json={"title": "Mobile idea", "raw_intent": "quero um app mobile de pedidos", "locale": "pt-BR", "delivery_type": "mobile"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["delivery_type"] == "mobile"
    assert body["spec"]["delivery_type"] == "mobile"


def test_work_estimate_requires_a_compiled_spec_first(client: TestClient) -> None:
    room = _create_room(client)  # empty raw_intent -> no spec compiled yet
    response = client.get(f"/api/project-rooms/{room['room_id']}/work-estimate")
    assert response.status_code == 409


def test_work_estimate_is_available_once_a_spec_is_compiled(client: TestClient) -> None:
    response = client.post(
        "/api/project-rooms",
        json={"title": "Loja online", "raw_intent": "quero uma loja online completa", "locale": "pt-BR"},
    )
    assert response.status_code == 201, response.text
    room = response.json()
    assert room["spec"] is not None

    estimate = client.get(f"/api/project-rooms/{room['room_id']}/work-estimate")
    assert estimate.status_code == 200, estimate.text
    body = estimate.json()
    assert body["size_band"] in {"landing_page", "api_simples", "saas", "enterprise"}
    assert body["healthy_minimum_label"]
    assert body["no_rush_message"]


def test_create_project_room_defaults_preferred_language_to_auto(client: TestClient) -> None:
    room = _create_room(client)
    assert room["preferred_language"] == ""


def test_preferred_language_is_enforced_on_the_compiled_spec(client: TestClient) -> None:
    # The user's explicit language choice is a room-level decision: even though
    # the intent text says nothing about Go, the compiled spec MUST come out in
    # Go — the orchestrator (LLM or mock) is never allowed to pick its own.
    response = client.post(
        "/api/project-rooms",
        json={
            "title": "Clinica",
            "raw_intent": "quero um SaaS para gestao de uma clinica medica",
            "locale": "pt-BR",
            "preferred_language": "go",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["preferred_language"] == "go"
    stack = body["spec"]["suggested_stack"]
    assert stack["language"] == "go"
    assert stack["framework"] == "gin"


def test_preferred_language_survives_later_refinement_turns(client: TestClient) -> None:
    response = client.post(
        "/api/project-rooms",
        json={
            "title": "Clinica",
            "raw_intent": "quero um SaaS para gestao de uma clinica medica",
            "locale": "pt-BR",
            "preferred_language": "java",
        },
    )
    assert response.status_code == 201, response.text
    room_id = response.json()["room_id"]
    # A refinement message mentioning another ecosystem must not flip the stack:
    # the room-level user decision keeps winning on every orchestrator turn.
    followup = client.post(
        f"/api/project-rooms/{room_id}/message",
        json={"content": "adicione relatorios em PDF e exportacao para excel com python"},
    )
    assert followup.status_code == 200, followup.text
    stack = followup.json()["spec"]["suggested_stack"]
    assert stack["language"] == "java"


def test_auto_preferred_language_still_lets_the_orchestrator_suggest(client: TestClient) -> None:
    response = client.post(
        "/api/project-rooms",
        json={
            "title": "Clinica",
            "raw_intent": "quero um SaaS para gestao de uma clinica medica",
            "locale": "pt-BR",
        },
    )
    assert response.status_code == 201, response.text
    stack = response.json()["spec"]["suggested_stack"]
    assert stack["language"]  # AI/mock suggested something — auto mode unchanged


def test_short_idea_produces_spec_and_messages(client: TestClient) -> None:
    room = _create_room(client)
    response = client.post(f"/api/project-rooms/{room['room_id']}/message", json={"content": "quero um SaaS para clinica"})
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["status"] == "UNDER_REVIEW"
    assert updated["spec"] is not None
    assert {m["role"] for m in updated["messages"]} >= {"user", "assistant"}
    assert updated["degraded"] is True


def test_generate_prompt_master_has_all_sections(client: TestClient) -> None:
    room = _create_room(client, raw_intent="quero um SaaS para clinica")
    response = client.post(f"/api/project-rooms/{room['room_id']}/generate-prompt")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "PROMPT_READY"
    normalized = _ascii(body["prompt_master_md"])
    for title in MANDATORY_SECTION_TITLES:
        assert title in normalized, f"missing section: {title}"
    assert body["prompt_master_versions"][0]["version"] == 1


def test_generate_prompt_requires_spec_first(client: TestClient) -> None:
    room = _create_room(client)
    response = client.post(f"/api/project-rooms/{room['room_id']}/generate-prompt")
    assert response.status_code == 409
    body = _diagnostic(response)
    assert body["endpoint_called"].endswith("/generate-prompt")


def test_revise_prompt_adds_new_version(client: TestClient) -> None:
    room = _create_room(client, raw_intent="quero um SaaS para clinica")
    client.post(f"/api/project-rooms/{room['room_id']}/generate-prompt")
    response = client.post(f"/api/project-rooms/{room['room_id']}/revise-prompt", json={"adjustment": "adicione agendamento"})
    assert response.status_code == 200, response.text
    versions = response.json()["prompt_master_versions"]
    assert [v["version"] for v in versions] == [1, 2]


def test_approve_then_send_to_generator(client: TestClient) -> None:
    room_id = _engineering_approved_room(client)
    sent = client.post(f"/api/project-rooms/{room_id}/send-to-generator")
    assert sent.status_code == 200, sent.text
    body = sent.json()
    assert body["status"] == "WAITING_META_FACTORY"
    assert body["generation_handoff"]["status"] == "queued"
    assert body["generation_handoff"]["project_id"] == room_id
    assert body["workflow"]["primary_action"] == "open_meta_factory"
    assert all(check["status"] == "passed" for check in body["readiness_checklist"])
    assert any(event["event"] == "Enviado Meta-Fabrica" for event in body["history"])


def test_send_to_generator_before_review_returns_diagnostic(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    client.post(f"/api/project-rooms/{room_id}/blueprint")
    response = client.post(f"/api/project-rooms/{room_id}/send-to-generator")
    assert response.status_code == 409
    body = _diagnostic(response)
    assert body["status_current"] == "BLUEPRINT_READY"
    assert body["status_expected"] == ["ENGINEERING_APPROVED"]
    assert body["endpoint_called"].endswith("/send-to-generator")
    assert body["http_status"] == 409
    assert any(check["id"] == "engineering_review" and check["status"] == "failed" for check in body["checks"])
    room = client.get(f"/api/project-rooms/{room_id}").json()
    assert any(entry["status"] == "rollback" for entry in room["operational_log"])


def test_approve_requires_prompt_ready(client: TestClient) -> None:
    room = _create_room(client, raw_intent="quero um SaaS para clinica")
    response = client.post(f"/api/project-rooms/{room['room_id']}/approve")
    assert response.status_code == 409


def test_user_cannot_access_another_users_room(client: TestClient) -> None:
    room = _create_room(client, title="Privada do usuario A")
    other_token = _register_second_user(client)
    foreign = client.get(f"/api/project-rooms/{room['room_id']}", headers={"Authorization": f"Bearer {other_token}"})
    assert foreign.status_code == 404
    listing = client.get("/api/project-rooms", headers={"Authorization": f"Bearer {other_token}"})
    assert listing.status_code == 200
    assert all(item["room_id"] != room["room_id"] for item in listing.json())


def test_secrets_are_redacted_in_messages(client: TestClient) -> None:
    room = _create_room(client)
    secret = "sk-supersecret123456"
    client.post(f"/api/project-rooms/{room['room_id']}/message", json={"content": f"api_key={secret} token=zzz"})
    serialized = json.dumps(client.get(f"/api/project-rooms/{room['room_id']}").json())
    assert secret not in serialized
    assert "[REDACTED]" in serialized


def test_deterministic_mode_is_flagged_not_faked(client: TestClient) -> None:
    room = _create_room(client, raw_intent="quero um SaaS para clinica")
    body = client.post(f"/api/project-rooms/{room['room_id']}/generate-prompt").json()
    assert body["degraded"] is True
    assert "Modo Determin" in body["prompt_master_md"]
    assert body["prompt_master_versions"][0]["degraded"] is True


def _blueprint_room(client: TestClient) -> str:
    """A room with a (deterministic) Blueprint, Engineering Review opened — not yet approved."""
    room_id = _approved_prompt_room(client)
    assert client.post(f"/api/project-rooms/{room_id}/blueprint").status_code == 200
    assert client.post(f"/api/project-rooms/{room_id}/engineering-review").status_code == 200
    return room_id


def test_deep_decision_fields_present_in_blueprint(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    body = client.post(f"/api/project-rooms/{room_id}/blueprint").json()
    decisions = body["architecture_blueprint"]["decisions"]
    backend = next(d for d in decisions if d["area"] == "backend")
    # Deep engineering rationale is populated, not just choice/justification.
    assert backend["impact"]
    assert backend["tradeoffs"]
    assert backend["risks"]
    assert backend["when_to_reconsider"]
    assert backend["dependencies"]


def test_engineering_review_assessment_and_score_present(client: TestClient) -> None:
    room_id = _blueprint_room(client)
    room = client.get(f"/api/project-rooms/{room_id}").json()
    review = room["engineering_review"]
    assert review is not None
    # A degraded preview is flagged as debatable/risky, never silently accepted.
    assert any("deterministico" in f["title"].lower() or "preview" in f["title"].lower() for f in review["debatable_decisions"])
    score = review["score"]
    assert score is not None
    keys = {c["key"] for c in score["categories"]}
    assert {"architecture", "security", "scalability", "maintainability", "generation", "documentation"} <= keys
    # Scored categories carry a number; unavailable ones are honest, not invented.
    for cat in score["categories"]:
        if cat["status"] == "unavailable":
            assert cat["score"] is None
        else:
            assert isinstance(cat["score"], int)


def test_committee_dimensions_and_final_opinion_present(client: TestClient) -> None:
    room_id = _blueprint_room(client)
    review = client.get(f"/api/project-rooms/{room_id}").json()["engineering_review"]
    roles = {m["role"] for m in review["committee"]}
    assert {"Architect", "Security", "Performance", "QA", "DevOps", "Documentation", "AI Reviewer"} <= roles
    for member in review["committee"]:
        assert 0 <= member["rating"] <= 5
        assert member["verdict"] in {"approved", "approved_with_caveats", "changes_requested"}
    dim_keys = {d["key"] for d in review["dimensions"]}
    assert {"security", "scalability", "performance", "cost", "documentation", "quality"} <= dim_keys
    cost = next(d for d in review["dimensions"] if d["key"] == "cost")
    assert cost["status"] == "unavailable"  # honest: no numeric/monetary cost score
    assert "qualitativa" in cost["verdict"].lower()
    opinion = review["final_opinion"]
    assert opinion["deterministic"] is True  # no LLM in tests
    assert "determin" in opinion["disclaimer"].lower()
    assert opinion["complexity"] in {"Baixa", "Média", "Alta"}


def test_architecture_model_views_are_honest(client: TestClient) -> None:
    room_id = _blueprint_room(client)
    model = client.get(f"/api/project-rooms/{room_id}").json()["architecture_model"]
    assert model is not None and model["deterministic"] is True
    # Context diagram always has the core actors/layers.
    node_ids = {n["id"] for n in model["context_diagram"]["nodes"]}
    assert {"user", "frontend", "api", "backend", "db"} <= node_ids
    # Data flow + auth flow derived from decided areas.
    assert any(step["step"] == "Banco" for step in model["data_flow"])
    assert any(step["step"] == "RBAC" for step in model["auth_flow"])  # authorization was decided
    # Bounded contexts include Identity & Access when auth is decided.
    assert any(c["name"] == "Identity & Access" for c in model["bounded_contexts"])


def _mobile_blueprint_room(client: TestClient) -> str:
    """Mirrors _approved_prompt_room/_blueprint_room but with delivery_type='mobile'
    set at creation, so the Architect Engine decides a real 'mobile' area."""
    response = client.post(
        "/api/project-rooms",
        json={"title": "Mobile idea", "raw_intent": "quero um app mobile de pedidos", "locale": "pt-BR", "delivery_type": "mobile"},
    )
    assert response.status_code == 201, response.text
    room_id = response.json()["room_id"]
    assert client.post(f"/api/project-rooms/{room_id}/generate-prompt").status_code == 200
    approved = client.post(f"/api/project-rooms/{room_id}/approve")
    assert approved.status_code == 200, approved.text
    assert client.post(f"/api/project-rooms/{room_id}/blueprint").status_code == 200
    return room_id


def test_mobile_delivery_type_produces_a_mobile_blueprint_decision(client: TestClient) -> None:
    room_id = _mobile_blueprint_room(client)
    room = client.get(f"/api/project-rooms/{room_id}").json()
    decisions = room["architecture_blueprint"]["decisions"]
    mobile = next((d for d in decisions if d["area"] == "mobile"), None)
    assert mobile is not None
    assert "Expo" in mobile["choice"] or "Flutter" in mobile["choice"]
    assert mobile["justification"]
    assert mobile["dependencies"]


def test_web_delivery_type_has_no_mobile_blueprint_decision(client: TestClient) -> None:
    room_id = _blueprint_room(client)  # default delivery_type="web"
    room = client.get(f"/api/project-rooms/{room_id}").json()
    decisions = room["architecture_blueprint"]["decisions"]
    assert not any(d["area"] == "mobile" for d in decisions)


def test_mobile_room_architecture_readiness_never_exceeds_100_percent(client: TestClient) -> None:
    """Regression guard: before Phase 2, the readiness denominator was a hardcoded
    10 -- an 11-decision mobile blueprint would have scored >100%."""
    room_id = _mobile_blueprint_room(client)
    review = client.get(f"/api/project-rooms/{room_id}").json()["engineering_review"]
    architecture = next(c for c in review["score"]["categories"] if c["key"] == "architecture")
    assert architecture["score"] is not None
    assert architecture["score"] <= 100
    assert "11" in architecture["basis"]  # denominator reflects the 11th (mobile) area


def test_mobile_room_architecture_model_includes_mobile_node(client: TestClient) -> None:
    room_id = _mobile_blueprint_room(client)
    model = client.get(f"/api/project-rooms/{room_id}").json()["architecture_model"]
    node_ids = {n["id"] for n in model["context_diagram"]["nodes"]}
    assert "mobile" in node_ids
    edges = model["context_diagram"]["edges"]
    assert any(e["from_id"] == "mobile" and e["to_id"] == "api" for e in edges)


def test_acknowledge_preview_requires_exact_phrase(client: TestClient) -> None:
    room_id = _blueprint_room(client)
    wrong = client.post(f"/api/project-rooms/{room_id}/acknowledge-preview", json={"confirmation": "ok continuar"})
    assert wrong.status_code == 409
    body = _diagnostic(wrong)
    assert body["endpoint_called"].endswith("/acknowledge-preview")


def test_approve_blocks_degraded_blueprint_until_acknowledged(client: TestClient) -> None:
    room_id = _blueprint_room(client)
    # Approving a deterministic (degraded) blueprint without acknowledging is rejected.
    blocked = client.post(f"/api/project-rooms/{room_id}/approve")
    assert blocked.status_code == 409
    body = _diagnostic(blocked)
    assert "preview" in body["correction"].lower() or "CONTINUAR COM PREVIEW" in body["correction"]
    # After the conscious acknowledgement, approval succeeds and is audited.
    ack = client.post(f"/api/project-rooms/{room_id}/acknowledge-preview", json={"confirmation": "CONTINUAR COM PREVIEW"})
    assert ack.status_code == 200, ack.text
    approved = client.post(f"/api/project-rooms/{room_id}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "ENGINEERING_APPROVED"
    history = client.get(f"/api/project-rooms/{room_id}").json()["history"]
    assert any(event["event"] == "Continuacao em modo deterministico" for event in history)


def test_import_markdown_creates_approved_room_and_keeps_document(client: TestClient) -> None:
    markdown = "# PromptMaster - Clinica\n\n## Visao Geral\nSaaS para clinica odontologica."
    response = client.post("/api/project-rooms/import", json={"format": "markdown", "content": markdown, "title": "Clinica importada"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "PROMPT_APPROVED"
    assert body["spec"] is not None
    assert body["prompt_master_md"] == markdown


def test_import_json_spec_creates_approved_room(client: TestClient) -> None:
    spec = {"raw_intent": "Quero um marketplace de servicos", "confidence": 0.9}
    response = client.post("/api/project-rooms/import", json={"format": "json", "content": json.dumps(spec), "title": "Marketplace importado"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "PROMPT_APPROVED"
    assert body["spec"]["raw_intent"] == "Quero um marketplace de servicos"
    assert "## Visao Geral" in _ascii(body["prompt_master_md"])


def test_import_invalid_json_returns_422(client: TestClient) -> None:
    response = client.post("/api/project-rooms/import", json={"format": "json", "content": "{not valid json", "title": "x"})
    assert response.status_code == 422


def test_mark_generated_sets_status_and_project(client: TestClient) -> None:
    room_id = _engineering_approved_room(client)
    client.post(f"/api/project-rooms/{room_id}/send-to-generator")
    response = client.post(f"/api/project-rooms/{room_id}/mark-generated", json={"generated_project_id": "project_abc123"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "READY"
    assert body["generation_handoff"]["status"] == "generated"
    assert body["generation_handoff"]["generated_project_id"] == "project_abc123"


def test_archive_sets_status_archived(client: TestClient) -> None:
    room = _create_room(client, title="Para arquivar")
    response = client.post(f"/api/project-rooms/{room['room_id']}/archive")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ARCHIVED"


def test_blueprint_generation_is_versioned_and_never_overwrites(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    first = client.post(f"/api/project-rooms/{room_id}/blueprint")
    assert first.status_code == 200, first.text
    first_room = first.json()
    assert first_room["active_blueprint_version"] == 1
    assert len(first_room["blueprint_versions"]) == 1
    assert len(first_room["blueprint_versions"][0]["hash"]) == 64

    second = client.post(f"/api/project-rooms/{room_id}/blueprint")
    assert second.status_code == 200, second.text
    second_room = second.json()
    assert second_room["active_blueprint_version"] == 2
    assert [item["version"] for item in second_room["blueprint_versions"]] == [1, 2]
    assert second_room["blueprint_versions"][1]["base_version"] == 1


def test_blueprint_versions_restore_duplicate_and_delete(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    client.post(f"/api/project-rooms/{room_id}/blueprint")
    client.post(f"/api/project-rooms/{room_id}/blueprint")

    restored = client.post(f"/api/project-rooms/{room_id}/blueprints/1/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["active_blueprint_version"] == 1

    duplicated = client.post(f"/api/project-rooms/{room_id}/blueprints/1/duplicate")
    assert duplicated.status_code == 200, duplicated.text
    assert duplicated.json()["active_blueprint_version"] == 3
    assert duplicated.json()["blueprint_versions"][-1]["base_version"] == 1

    deleted = client.delete(f"/api/project-rooms/{room_id}/blueprints/2")
    assert deleted.status_code == 200, deleted.text
    assert [item["version"] for item in deleted.json()["blueprint_versions"]] == [1, 3]


def test_blueprint_stream_reports_progress_decisions_and_completion(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    response = client.post(
        f"/api/project-rooms/{room_id}/blueprint/stream",
        json={"mode": "deterministic"},
    )
    assert response.status_code == 200, response.text
    assert "event: progress" in response.text
    assert "event: decision" in response.text
    assert "event: complete" in response.text
    room = client.get(f"/api/project-rooms/{room_id}").json()
    assert room["status"] == "BLUEPRINT_READY"
    assert room["active_blueprint_version"] == 1


def test_blueprint_stream_never_silently_falls_back_when_llm_was_requested(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    response = client.post(
        f"/api/project-rooms/{room_id}/blueprint/stream",
        json={"mode": "llm"},
    )
    assert response.status_code == 409
    room = client.get(f"/api/project-rooms/{room_id}").json()
    assert room["architecture_blueprint"] is None


def test_blueprint_stream_cancellation_preserves_previous_state(client: TestClient, monkeypatch) -> None:
    import app.services.project_room_service as project_room_module

    room_id = _approved_prompt_room(client)
    started = threading.Event()
    release = threading.Event()
    original = project_room_module.build_blueprint

    def slow_blueprint(*args, **kwargs):
        started.set()
        assert release.wait(timeout=5)
        return original(*args, **kwargs)

    monkeypatch.setattr(project_room_module, "build_blueprint", slow_blueprint)
    result: dict[str, object] = {}

    def stream_request() -> None:
        result["response"] = client.post(
            f"/api/project-rooms/{room_id}/blueprint/stream",
            json={"mode": "deterministic"},
        )

    worker = threading.Thread(target=stream_request)
    worker.start()
    assert started.wait(timeout=5)
    cancel = client.post(f"/api/project-rooms/{room_id}/blueprint/cancel")
    assert cancel.status_code == 200, cancel.text
    release.set()
    worker.join(timeout=10)
    assert not worker.is_alive()

    response = result["response"]
    assert isinstance(response, object)
    room = client.get(f"/api/project-rooms/{room_id}").json()
    assert room["status"] == "PROMPT_APPROVED"
    assert room["architecture_blueprint"] is None
    assert room["blueprint_versions"] == []


def test_engineering_review_uses_active_llm_blueprint_metadata(client: TestClient, monkeypatch) -> None:
    from app.engines.llm.router import LLMRouter
    from app.schemas.llm import LLMResponse, Provider

    room_id = _approved_prompt_room(client)
    client.post("/api/user-ai-keys/session", json={"provider": "anthropic", "api_key": "sk-test-blueprint-provider-1234"})
    response = LLMResponse(
        provider=Provider.anthropic,
        model="claude-sonnet-4",
        text="{}",
        parsed={"decisions": [{"area": "backend", "choice": "FastAPI", "justification": "Arquitetura tipada.", "alternatives_considered": ["NestJS"], "tradeoffs": ["Python runtime"]}]},
        usage={"input_tokens": 20, "output_tokens": 30, "total_tokens": 50},
    )
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)
    generated = client.post(
        f"/api/project-rooms/{room_id}/blueprint",
        json={"mode": "llm", "user_model_choice": "claude-sonnet-4", "use_user_key": True},
    )
    assert generated.status_code == 200, generated.text
    blueprint = generated.json()["architecture_blueprint"]
    assert generated.json()["degraded"] is False
    assert blueprint["degraded"] is False
    assert blueprint["mode"] == "llm"
    assert blueprint["provider"] == "anthropic"
    assert blueprint["providerLabel"] == "Claude"
    assert blueprint["model"] == "claude-sonnet-4"
    assert blueprint["version"] == 1

    opened = client.post(f"/api/project-rooms/{room_id}/engineering-review")
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert body["architecture_blueprint"]["degraded"] is False
    assert body["engineering_review"]["final_opinion"]["deterministic"] is False
    assert "modo determin" not in body["engineering_review"]["final_opinion"]["disclaimer"].lower()

    validation = client.post(f"/api/project-rooms/{room_id}/engineering-review/validate")
    assert validation.status_code == 200, validation.text
    validation_body = validation.json()
    assert validation_body["provider"] == "anthropic"
    assert validation_body["providerLabel"] == "Claude"
    assert validation_body["degraded"] is False
    assert validation_body["checks"][2]["passed"] is True

    # Before Stack Approval Gate + the rest of the readiness checklist are
    # satisfied, the "readiness" check must fail *and* its detail message must
    # actually name what's pending -- not the pass-case "no blockers" text
    # (a live smoke test caught this: the message previously claimed "no
    # blockers" while simultaneously being reported as a blocker).
    readiness_check = next(c for c in validation_body["checks"] if c["id"] == "readiness")
    assert readiness_check["passed"] is False
    assert "sem bloqueios" not in readiness_check["detail"].lower()
    assert "pendentes" in readiness_check["detail"].lower()


# --- delete ------------------------------------------------------------------ #

def test_delete_project_room_removes_it_permanently(client: TestClient) -> None:
    room = _create_room(client, title="Sala descartavel")
    room_id = room["room_id"]

    deleted = client.delete(f"/api/project-rooms/{room_id}")
    assert deleted.status_code == 204, deleted.text

    assert client.get(f"/api/project-rooms/{room_id}").status_code == 404
    assert all(item["room_id"] != room_id for item in client.get("/api/project-rooms").json())
    # Deleting again is an honest 404, not a silent success.
    assert client.delete(f"/api/project-rooms/{room_id}").status_code == 404


def test_delete_project_room_is_owner_scoped(client: TestClient) -> None:
    room = _create_room(client, title="Sala privada do usuario A")
    other_token = _register_second_user(client)

    foreign = client.delete(
        f"/api/project-rooms/{room['room_id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert foreign.status_code == 404

    # The owner still sees the room untouched.
    assert client.get(f"/api/project-rooms/{room['room_id']}").status_code == 200


# --- named events + global state machine -------------------------------------- #

def test_create_room_emits_a_project_created_event(client: TestClient) -> None:
    room = _create_room(client, title="Sala com evento")

    feed = client.get("/api/activity-feed", params={"category": "project"})
    assert feed.status_code == 200, feed.text
    matches = [item for item in feed.json()["items"] if item["project_id"] == room["room_id"] and item["action"] == "created"]
    assert len(matches) == 1
    assert matches[0]["source"] == "event_catalog"
    assert matches[0]["metadata"]["payload_version"] == 1


def test_generate_blueprint_emits_a_blueprint_generated_event(client: TestClient) -> None:
    room_id = _approved_prompt_room(client)
    generated = client.post(f"/api/project-rooms/{room_id}/blueprint")
    assert generated.status_code == 200, generated.text

    feed = client.get("/api/activity-feed", params={"category": "project"})
    assert feed.status_code == 200, feed.text
    matches = [item for item in feed.json()["items"] if item["project_id"] == room_id and item["action"] == "blueprint_generated"]
    assert len(matches) == 1
    assert matches[0]["metadata"]["version"] == 1


def test_abstract_state_reflects_room_status_before_generation(client: TestClient) -> None:
    room = _create_room(client, title="Sala em rascunho")
    response = client.get(f"/api/project-rooms/{room['room_id']}/abstract-state")
    assert response.status_code == 200, response.text
    assert response.json() == {"abstract_state": "Idle", "room_status": "DRAFT"}

    room_id = _approved_prompt_room(client)
    response = client.get(f"/api/project-rooms/{room_id}/abstract-state")
    assert response.status_code == 200, response.text
    assert response.json()["abstract_state"] == "Planning"
    assert response.json()["room_status"] == "PROMPT_APPROVED"


def test_abstract_state_is_owner_scoped(client: TestClient) -> None:
    room = _create_room(client, title="Sala privada")
    other_token = _register_second_user(client)

    foreign = client.get(
        f"/api/project-rooms/{room['room_id']}/abstract-state",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert foreign.status_code == 404


def test_abstract_state_unknown_room_is_404(client: TestClient) -> None:
    response = client.get("/api/project-rooms/does-not-exist/abstract-state")
    assert response.status_code == 404
