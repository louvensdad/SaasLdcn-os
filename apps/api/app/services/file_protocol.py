from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.data.agent_territories import territory_violations

# Parser for the shared agent output protocol (PASSO 4.1). Agents respond with a
# sequence of FILE blocks plus one MANIFEST block. This turns "LLM response" into
# "files on disk" deterministically — the linchpin that fixes diagnosis error #4.
#
#   <<<FILE path="relative/path.ext">>>
#   <file contents>
#   <<<END>>>
#   ...
#   <<<MANIFEST>>>
#   {"files": [...], "entrypoint": "...", "assumptions": [], "open_questions": []}
#   <<<END>>>

_FILE_RE = re.compile(
    r'<<<FILE\s+path="(?P<path>[^"]+)">>>\r?\n(?P<body>.*?)\r?\n?<<<END>>>',
    re.DOTALL,
)
_MANIFEST_RE = re.compile(r"<<<MANIFEST>>>\r?\n(?P<json>.*?)\r?\n?<<<END>>>", re.DOTALL)


@dataclass
class EmittedFile:
    path: str
    content: str


@dataclass
class ParsedAgentOutput:
    files: list[EmittedFile] = field(default_factory=list)
    manifest: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def parse_agent_output(raw: str, *, agent_role: str | None = None) -> ParsedAgentOutput:
    """Parse an agent response into files + manifest, validating territory.

    Validation, not silent best-effort: every problem is recorded in `errors`
    (the opposite of the swallowed-exception anti-pattern, diagnosis error #5).
    """
    result = ParsedAgentOutput()

    seen: set[str] = set()
    for match in _FILE_RE.finditer(raw):
        path = match.group("path").strip()
        if not path:
            result.errors.append("FILE block with empty path.")
            continue
        if path in seen:
            result.errors.append(f"Duplicate FILE path: {path}")
            continue
        seen.add(path)
        result.files.append(EmittedFile(path=path, content=match.group("body")))

    if not result.files:
        result.errors.append("No FILE blocks found in agent output.")

    manifest_match = _MANIFEST_RE.search(raw)
    if not manifest_match:
        result.errors.append("Missing MANIFEST block.")
    else:
        try:
            result.manifest = json.loads(manifest_match.group("json"))
        except json.JSONDecodeError as exc:
            result.errors.append(f"MANIFEST is not valid JSON: {exc}")

    if agent_role is not None:
        violations = territory_violations(agent_role, [f.path for f in result.files])
        for path in violations:
            result.errors.append(f"Agent '{agent_role}' wrote outside its territory: {path}")

    return result
