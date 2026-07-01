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

# --- Tolerant fallbacks (used only when no <<<FILE>>> markers are present) ---
# A fenced code block, capturing the optional info string (which often carries the
# filename) and the body. Matched non-greedily so adjacent blocks don't merge.
_FENCE_BLOCK_RE = re.compile(r"```(?P<info>[^\n`]*)\r?\n(?P<body>.*?)\r?\n?```", re.DOTALL)
# A path-looking token: has a dir separator or a known file extension, no spaces.
_PATH_TOKEN_RE = re.compile(
    r"(?P<path>(?:[\w.\-]+/)*[\w.\-]+\.(?:py|java|ts|tsx|js|jsx|json|ya?ml|md|sql|sh|env|"
    r"toml|cfg|ini|xml|html|css|scss|txt|go|rs|rb|php|cs|kt|gradle|properties|dockerfile|gitignore|conf))"
)
# An inline path hint just inside a fence body: "# file: x", "// path: x", "<!-- x -->".
_INLINE_PATH_RE = re.compile(
    r"^\s*(?:#|//|/\*|<!--|--)?\s*(?:file|path|filename|arquivo)?\s*[:=]?\s*(?P<path>(?:[\w.\-]+/)*[\w.\-]+\.\w+)\s*(?:-->|\*/)?\s*$",
    re.IGNORECASE,
)
# XML-style <file path="...">...</file>.
_XML_FILE_RE = re.compile(r'<file\s+path="(?P<path>[^"]+)"\s*>(?P<body>.*?)</file>', re.DOTALL | re.IGNORECASE)


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
    # Diagnostics — never lose the response; explain exactly how it was parsed.
    raw_response: str = ""
    parser_strategy: str = "markers"
    parser_confidence: float = 1.0
    missing: list[str] = field(default_factory=list)
    # Per-attempt log filled by the pipeline's smart retry.
    attempts: list[dict] = field(default_factory=list)
    # True when the agent had to fall back to partitioned (compressed) generation
    # because the provider rejected the payload as too large (HTTP 413).
    partitioned: bool = False

    @property
    def ok(self) -> bool:
        # Warnings (territory drift, a synthesized manifest) do not fail the agent;
        # only structural errors (no parseable files) do.
        return not self.errors

    def diagnostics(self) -> dict:
        return {
            "parser_strategy": self.parser_strategy,
            "parser_confidence": round(self.parser_confidence, 2),
            "file_count": len(self.files),
            "missing": list(self.missing),
            "attempts": list(self.attempts),
            "errors": list(self.errors),
            "warnings": list(self.warnings),
        }


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
    result.raw_response = raw or ""
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

    if result.files:
        result.parser_strategy = "markers"
        result.parser_confidence = 1.0
    else:
        # No <<<FILE>>> markers — never give up. Recover files by MEANING from
        # markdown fences (with path hints), a JSON files array, or XML <file>
        # tags. Recovery is a warning, not an error: the flow must continue.
        recovered, strategy, confidence = _tolerant_extract(raw)
        if recovered:
            for emitted in recovered:
                if emitted.path in seen:
                    continue
                seen.add(emitted.path)
                result.files.append(emitted)
            result.parser_strategy = strategy
            result.parser_confidence = confidence
            result.warnings.append(
                f"Sem marcadores <<<FILE>>>; {len(result.files)} arquivo(s) recuperado(s) via parser tolerante ({strategy})."
            )
        else:
            result.parser_strategy = "none"
            result.parser_confidence = 0.0
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

    # REGRA 0 — manifest integrity: the manifest must describe exactly the files
    # that were actually emitted. Any manifest entry without a corresponding FILE
    # block is pruned (so file_count never diverges from what lands on disk), and
    # the divergence is surfaced as a warning.
    _reconcile_manifest(result)

    if agent_role is not None:
        violations = territory_violations(agent_role, [f.path for f in result.files])
        for path in violations:
            # Territory drift is governance signal, not a reason to drop the file:
            # standalone single-stack projects use idiomatic root layouts.
            result.warnings.append(f"Agent '{agent_role}' wrote outside its territory: {path}")

    return result


def _loads_lenient_json(blob: str):
    blob = (blob or "").strip()
    if not blob:
        return None
    no_trailing = re.sub(r",(\s*[}\]])", r"\1", blob)
    for attempt in (blob, no_trailing):
        try:
            return json.loads(attempt)
        except Exception:  # noqa: BLE001
            continue
    return None


def _files_from_json(data) -> list[EmittedFile]:
    if isinstance(data, dict):
        inner = data.get("files")
        data = inner if isinstance(inner, list) else None
    out: list[EmittedFile] = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            path = item.get("path") or item.get("file") or item.get("filename") or item.get("name")
            content = item.get("content")
            if content is None:
                content = item.get("body") or item.get("code") or item.get("source") or ""
            if path and isinstance(content, str):
                out.append(EmittedFile(path=str(path).strip(), content=content))
    return out


def _extract_json_files(raw: str) -> list[EmittedFile]:
    candidates = [raw]
    for match in _FENCE_BLOCK_RE.finditer(raw):
        body = match.group("body")
        if "json" in match.group("info").lower() or body.lstrip().startswith(("{", "[")):
            candidates.append(body)
    for blob in candidates:
        files = _files_from_json(_loads_lenient_json(blob))
        if files:
            return files
    return []


def _strip_cdata(body: str) -> str:
    body = body.strip()
    cdata = re.match(r"^\s*<!\[CDATA\[(?P<inner>.*?)\]\]>\s*$", body, re.DOTALL)
    if cdata:
        return cdata.group("inner")
    fence = _OUTER_FENCE_RE.match(body)
    return fence.group("inner") if fence else body


def _extract_xml_files(raw: str) -> list[EmittedFile]:
    out: list[EmittedFile] = []
    for match in _XML_FILE_RE.finditer(raw):
        path = match.group("path").strip()
        if path:
            out.append(EmittedFile(path=path, content=_strip_cdata(match.group("body"))))
    return out


def _extract_markdown_files(raw: str) -> tuple[list[EmittedFile], bool]:
    """Recover files from markdown code fences, finding the path from the fence
    info string, an inline 'file:' comment, or the preceding heading/label."""
    out: list[EmittedFile] = []
    explicit = False
    seen: set[str] = set()
    last_end = 0
    for match in _FENCE_BLOCK_RE.finditer(raw):
        info = match.group("info").strip()
        body = match.group("body")
        path: str | None = None

        info_path = _PATH_TOKEN_RE.search(info)
        if info_path:
            path = info_path.group("path")
            explicit = True
        if not path:
            first, sep, rest = body.partition("\n")
            inline = _INLINE_PATH_RE.match(first)
            if inline:
                path = inline.group("path")
                body = rest
                explicit = True
        if not path:
            preamble = raw[last_end:match.start()]
            tokens = list(_PATH_TOKEN_RE.finditer(preamble))
            if tokens:
                path = tokens[-1].group("path")
        last_end = match.end()

        if not path:
            continue
        path = path.strip().strip("`*# ")
        if not path or path in seen:
            continue
        seen.add(path)
        out.append(EmittedFile(path=path, content=body))
    return out, explicit


def _tolerant_extract(raw: str) -> tuple[list[EmittedFile], str, float]:
    """Recover files by meaning when the strict <<<FILE>>> markers are absent."""
    files = _extract_json_files(raw)
    if files:
        return files, "json", 0.85
    files = _extract_xml_files(raw)
    if files:
        return files, "xml", 0.85
    files, explicit = _extract_markdown_files(raw)
    if files:
        return files, "markdown", 0.8 if explicit else 0.6
    return [], "none", 0.0


def _reconcile_manifest(result: ParsedAgentOutput) -> None:
    """Drop manifest entries that were never emitted as FILE blocks, so the manifest
    (and the file_count derived from it) can never claim files that do not exist."""
    listed = result.manifest.get("files")
    if not isinstance(listed, list):
        return
    emitted = {f.path for f in result.files}
    phantom = [p for p in listed if isinstance(p, str) and p not in emitted]
    if phantom:
        result.manifest["files"] = [p for p in listed if isinstance(p, str) and p in emitted]
        preview = ", ".join(phantom[:5]) + ("…" if len(phantom) > 5 else "")
        result.warnings.append(
            f"MANIFEST listed {len(phantom)} file(s) not emitted; pruned to match disk: {preview}"
        )


def _synthesize_manifest(files: list[EmittedFile]) -> dict:
    paths = [f.path for f in files]
    entrypoint = next(
        (p for p in paths if p.rsplit("/", 1)[-1] in {"main.py", "main.ts", "Application.java", "index.ts", "server.ts"}),
        paths[0] if paths else "",
    )
    return {"files": paths, "entrypoint": entrypoint, "assumptions": [], "open_questions": []}
