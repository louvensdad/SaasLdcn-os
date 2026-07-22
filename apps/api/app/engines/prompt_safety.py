from __future__ import annotations

import re


def wrap_untrusted(text: str, tag: str) -> str:
    """Delimit user-controlled text so the model treats it strictly as DATA, not as
    instructions (prompt-injection mitigation, audit S2). Neutralizes any attempt to
    close the delimiter and smuggle instructions (e.g. '</user_intent> ignore all
    previous instructions') while leaving the rest of the content intact.

    Used by orchestrator_engine.py, which turns free-text user input into a
    structured LLM call and needs this delimiter-breakout guard."""
    safe = (text or "").strip()
    safe = re.sub(rf"</\s*{re.escape(tag)}\s*>", rf"<\\/{tag}>", safe, flags=re.IGNORECASE)
    return f"<{tag}>\n{safe}\n</{tag}>"
