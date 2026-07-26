"""Validators related to user plans and instance limits."""

from typing import Optional

# Example plan configurations (should come from DB/config)
PLAN_LIMITS = {
    "free": {"max_instances": 1, "max_macros": 3},
    "starter": {"max_instances": 3, "max_macros": 10},
    "pro": {"max_instances": 10, "max_macros": 50},
    "enterprise": {"max_instances": 100, "max_macros": 500},
}


def get_plan_limit(plan: str, resource: str) -> Optional[int]:
    """Get the limit for a given plan and resource ('max_instances' or 'max_macros')."""
    limits = PLAN_LIMITS.get(plan)
    if limits:
        return limits.get(resource)
    return None


def can_start_instance(plan: str, current_active_count: int) -> bool:
    """
    Business rule: user cannot start a new instance if they already have
    max_instances active.
    """
    max_instances = get_plan_limit(plan, "max_instances")
    if max_instances is None:
        return False  # unknown plan
    return current_active_count < max_instances


def can_create_macro(plan: str, current_macro_count: int) -> bool:
    """
    Business rule: user cannot create a new macro if they already reached
    the plan's max_macros limit.
    """
    max_macros = get_plan_limit(plan, "max_macros")
    if max_macros is None:
        return False
    return current_macro_count < max_macros