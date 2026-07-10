from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.agent_foundation import AgentFoundationStatus, AgentRoleDefinition, AgentRoleId

# Agents Foundation (development Phase 7): deterministic role catalog only.
# This does not execute agents, call providers, write files, or bypass the
# orchestrator. It makes the required local agent boundaries explicit and
# testable before Agent Boost or autonomous execution exists.

PHASE7_REQUIRED_ROLE_IDS: tuple[AgentRoleId, ...] = (
    "orchestrator",
    "prompt_master",
    "architect",
    "gatekeeper",
    "security",
    "testing",
)

ORCHESTRATION_SEQUENCE: tuple[AgentRoleId, ...] = (
    "orchestrator",
    "prompt_master",
    "architect",
    "stack_specialist",
    "backend",
    "frontend",
    "security",
    "testing",
    "gatekeeper",
    "download",
)

_FORBIDDEN_ACTIONS = [
    "direct_filesystem_write",
    "direct_network_call",
    "direct_provider_call",
    "direct_database_mutation",
    "bypass_orchestrator",
]

_ROLE_DEFINITIONS: tuple[AgentRoleDefinition, ...] = (
    AgentRoleDefinition(
        id="orchestrator",
        label="Orchestrator Agent",
        purpose="Coordinates the ordered local planning flow and owns state transitions.",
        input_contract="User intent, project context, blueprint snapshots, and prior governed outputs.",
        output_contract="Ordered task plan and routed role requests; no direct generated code.",
        boundary="May sequence agents and aggregate results, but must not silently replace specialist outputs.",
        orchestrated_by=None,
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=[action for action in _FORBIDDEN_ACTIONS if action != "bypass_orchestrator"],
    ),
    AgentRoleDefinition(
        id="prompt_master",
        label="Prompt Master Agent",
        purpose="Transforms validated answers and blueprint data into structured prompt contracts.",
        input_contract="ProjectBlueprint or ProjectSpec plus explicit user requirements.",
        output_contract="Prompt Master contract sections, validation state, and safe trace metadata.",
        boundary="May transform requirements; must not invent stack decisions or execute generation.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="architect",
        label="Architect Agent",
        purpose="Reviews architecture direction, trade-offs, compatibility, and readiness.",
        input_contract="Technology graph, architecture profile, capabilities, infrastructure, and constraints.",
        output_contract="Architecture decisions, risks, recommendations, and readiness signals.",
        boundary="May advise and structure architecture; must not mutate approved stack choices directly.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="stack_specialist",
        label="Stack Specialist Agent",
        purpose="Checks stack-specific compatibility rules and framework expectations.",
        input_contract="Approved technology graph, stack lock, and framework constraints.",
        output_contract="Stack compatibility findings and implementation constraints.",
        boundary="May flag drift and incompatibility; must not swap stacks without a new approval path.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="frontend",
        label="Frontend Agent",
        purpose="Plans frontend surfaces against approved contracts and UX requirements.",
        input_contract="Prompt Master, endpoint plan, locale rules, and frontend stack constraints.",
        output_contract="Frontend implementation plan and UI coverage expectations.",
        boundary="May plan UI work; direct code emission is reserved for governed generation stages.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="backend",
        label="Backend Agent",
        purpose="Plans backend services, controllers, data access, validation, and auth boundaries.",
        input_contract="Prompt Master, endpoint plan, data model hints, and backend stack constraints.",
        output_contract="Backend implementation plan and service boundary expectations.",
        boundary="May plan backend work; direct code emission is reserved for governed generation stages.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="security",
        label="Security Agent",
        purpose="Reviews security baseline, secret handling, auth boundaries, and risky capabilities.",
        input_contract="Prompt Master security requirements, capabilities, endpoint plan, and quality signals.",
        output_contract="Security findings, blockers, and required mitigations.",
        boundary="May block unsafe progression; must not suppress or auto-approve critical findings.",
        test_coverage_id="test_agent_foundation_security_and_testing_roles_are_review_only",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="testing",
        label="Testing Agent",
        purpose="Reviews test strategy coverage for business rules, endpoints, and integration paths.",
        input_contract="Prompt Master testing requirements, endpoint plan, business rules, and risks.",
        output_contract="Testing coverage plan, missing coverage findings, and validation expectations.",
        boundary="May define coverage expectations; must not mark execution as passed without real results.",
        test_coverage_id="test_agent_foundation_security_and_testing_roles_are_review_only",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="gatekeeper",
        label="Gatekeeper Agent",
        purpose="Applies governed checks and decides whether progression is approved or blocked.",
        input_contract="Blueprint, Prompt Master, readiness signals, security review, and testing review.",
        output_contract="Gatekeeper decision, blockers, warnings, checks, and safe trace metadata.",
        boundary="May approve, warn, or block; must not execute generation or bypass failed checks.",
        test_coverage_id="test_agent_foundation_gatekeeper_is_last_decision_role",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="download",
        label="Download Agent",
        purpose="Plans artifact delivery checks after a project is verified.",
        input_contract="Verified project id, package readiness, and export policy.",
        output_contract="Download readiness status and packaging constraints.",
        boundary="May inspect delivery readiness; must not package unverified projects directly.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="template",
        label="Template Agent",
        purpose="Reviews template fit against blueprint and stack constraints.",
        input_contract="Template metadata, blueprint, technology graph, and capability set.",
        output_contract="Template compatibility result and mismatch warnings.",
        boundary="May recommend templates; must not apply a template without the orchestrated flow.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="ui_ux",
        label="UI/UX Agent",
        purpose="Reviews product interface expectations and accessibility constraints.",
        input_contract="Project type, target users, workflows, locale, and design constraints.",
        output_contract="UX requirements, accessibility concerns, and screen coverage expectations.",
        boundary="May critique or plan UX; must not override product requirements or emit UI code directly.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
    AgentRoleDefinition(
        id="ldcn",
        label="LDCN Agent",
        purpose="Represents the contextual copilot surface without controlling governed execution.",
        input_contract="User-facing context, session state, and approved action metadata.",
        output_contract="Explanations, suggestions, and orchestrator-bound action requests.",
        boundary="May assist the user; must not execute controlled actions outside orchestrator approval.",
        test_coverage_id="test_agent_foundation_catalog_declares_all_required_roles",
        forbidden_actions=_FORBIDDEN_ACTIONS,
    ),
)


def list_agent_roles() -> list[AgentRoleDefinition]:
    return [role.model_copy(deep=True) for role in _ROLE_DEFINITIONS]


def get_agent_foundation_status() -> AgentFoundationStatus:
    return AgentFoundationStatus(
        roles=list_agent_roles(),
        phase7_required_role_ids=list(PHASE7_REQUIRED_ROLE_IDS),
        orchestration_sequence=list(ORCHESTRATION_SEQUENCE),
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )