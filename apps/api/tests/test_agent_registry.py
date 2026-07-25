from __future__ import annotations

import importlib
import re

import pytest

from app.runtime import agent_registry

_ATTR_RE = re.compile(r"^(\w+)((?:\.\w+)*)((?:\['[^']+'\])?)$")


def _resolve(implementation: str) -> object:
    """Resolves a `module.path:Name.attr['key']`-style reference to the real
    object it names, so a renamed/removed engine fails this test instead of
    silently rotting in the registry."""
    module_path, sep, attr_expr = implementation.partition(":")
    assert sep, f"implementation string missing ':' separator: {implementation!r}"
    module = importlib.import_module(module_path)
    match = _ATTR_RE.match(attr_expr)
    assert match, f"cannot parse implementation reference: {implementation!r}"
    name, dotted, subscript = match.groups()
    obj = getattr(module, name)
    for part in dotted.split(".")[1:] if dotted else []:
        obj = getattr(obj, part)
    if subscript:
        key = subscript[2:-2]
        if isinstance(obj, dict):
            obj = obj[key]
        elif isinstance(obj, (list, tuple)):
            assert key in obj, f"{key!r} not found in {implementation!r}"
            obj = key
        else:
            raise TypeError(f"cannot subscript {type(obj)!r} for {implementation!r}")
    return obj


def test_every_agent_id_is_unique():
    ids = [agent.id for agent in agent_registry.all_agents()]
    assert len(ids) == len(set(ids))


def test_every_active_agent_has_a_resolvable_implementation():
    for agent in agent_registry.active_agents():
        assert agent.implementation, f"{agent.id} is active but has no implementation reference"
        _resolve(agent.implementation)  # raises with a clear message if it drifted


def test_every_planned_agent_has_no_implementation():
    # A "planned" agent claiming a real implementation would be a lie about
    # what actually exists -- the whole point of this status is honesty
    # about the gap.
    for agent in agent_registry.planned_agents():
        assert agent.implementation == "", f"{agent.id} is planned but claims an implementation"


@pytest.mark.parametrize("agent", agent_registry.active_agents(), ids=lambda a: a.id)
def test_active_agent_has_success_and_failure_criteria(agent: agent_registry.AgentDefinition):
    assert agent.success_criteria, f"{agent.id} has no success_criteria"
    assert agent.failure_criteria, f"{agent.id} has no failure_criteria"


def test_by_category_matches_all_agents():
    categories = {agent.category for agent in agent_registry.all_agents()}
    total = sum(len(agent_registry.by_category(category)) for category in categories)
    assert total == len(agent_registry.all_agents())


# --- LDCN Multi-Agent Runtime, Phase 4: named diagnose-repair chains ------- #

def test_known_chains_are_exactly_deep_verification_and_recovery():
    assert set(agent_registry.known_chains()) == {"deep_verification", "recovery"}


def test_deep_verification_chain_is_the_three_real_engines_in_execution_order():
    chain = agent_registry.by_chain("deep_verification")
    assert [agent.id for agent in chain] == ["deep_verification_gate_agent", "auto_repair_agent", "llm_repair_agent"]


def test_recovery_chain_is_the_three_real_engines_in_execution_order():
    chain = agent_registry.by_chain("recovery")
    assert [agent.id for agent in chain] == ["root_cause_agent", "cause_validation_agent", "repair_engineer_agent"]


def test_unknown_chain_returns_empty_not_an_error():
    assert agent_registry.by_chain("not_a_real_chain") == ()


def test_every_chained_agent_is_active_not_planned():
    for chain in agent_registry.known_chains():
        for agent in agent_registry.by_chain(chain):
            assert agent.status == "active", f"{agent.id} is in chain {chain!r} but not active"
