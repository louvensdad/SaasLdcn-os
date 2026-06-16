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
#
# Robustness note: weaker models (e.g. Gemini Flash) often wrap the whole reply
# in a markdown code fence and omit the MANIFEST, and capable models legitimately
# emit an idiomatic single-project layout (root pom.xml, src/...) that does not
# match the monorepo territory prefixes. None of those should DISCARD correctly
# emitted files — they are recorded as warnings, not errors. Only a genuinely
# empty / unparseable reply is an error.

_FILE_RE = re.compile(
    r'<<<FILE\s+path="(?P<path>[^"]+)">>>\r?\n(?P<body>.*?)\r?\n?<<<END>>>',
    re.DOTALL,
)
_MANIFEST_RE = re.compile(r"<<<MANIFEST>>>\r?\n(?P<json>.*?)\r?\n?<<<END>>>", re.DOTALL)
_OUTER_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\r?\n(?P<inner>.*?)\r?\n```\s*$", re.DOTALL)


@dataclass
class EmittedFile:
    path: str
    content: str


@dataclass
class ParsedAgentOutput:
    files: list[EmittedFile] = field(default_factory=list)
    manifest: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        # Warnings (territory drift, a synthesized manifest) do not fail the agent;
        # only structural errors (no parseable files) do.
        return not self.errors


def _strip_outer_fence(raw: str) -> str:
    """Remove a single code fence wrapping the ENTIRE reply (some models do this).

    Only an outer wrapper is stripped — inner ``` fences inside file bodies (e.g.
    a generated README) are preserved.
    """
    match = _OUTER_FENCE_RE.match(raw)
    if match and "<<<FILE" in match.group("inner"):
        return match.group("inner")
    return raw


def parse_agent_output(raw: str, *, agent_role: str | None = None) -> ParsedAgentOutput:
    """Parse an agent response into files + manifest, validating territory.

    Problems are recorded: structural ones in `errors`, recoverable ones in
    `warnings`. Correctly emitted files are never discarded for a missing manifest
    or a territory mismatch.
    """
    result = ParsedAgentOutput()
    raw = _strip_outer_fence(raw)

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
    if manifest_match:
        try:
            result.manifest = json.loads(manifest_match.group("json"))
        except json.JSONDecodeError as exc:
            # Malformed manifest is recoverable: synthesize from the emitted files.
            result.warnings.append(f"MANIFEST is not valid JSON ({exc}); synthesized from files.")
            result.manifest = _synthesize_manifest(result.files)
    elif result.files:
        # Missing manifest but we have files: synthesize rather than discard.
        result.warnings.append("Missing MANIFEST block; synthesized from emitted files.")
        result.manifest = _synthesize_manifest(result.files)

    if agent_role is not None:
        violations = territory_violations(agent_role, [f.path for f in result.files])
        for path in violations:
            # Territory drift is governance signal, not a reason to drop the file:
            # standalone single-stack projects use idiomatic root layouts.
            result.warnings.append(f"Agent '{agent_role}' wrote outside its territory: {path}")

    return result


def _synthesize_manifest(files: list[EmittedFile]) -> dict:
    paths = [f.path for f in files]
    entrypoint = next(
        (p for p in paths if p.rsplit("/", 1)[-1] in {"main.py", "main.ts", "Application.java", "index.ts", "server.ts"}),
        paths[0] if paths else "",
    )
    return {"files": paths, "entrypoint": entrypoint, "assumptions": [], "open_questions": []}
