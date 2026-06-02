from __future__ import annotations

from collections.abc import Sequence

from app.data.foundation import STACKS


def get_stacks_registry() -> Sequence[dict]:
    return STACKS
