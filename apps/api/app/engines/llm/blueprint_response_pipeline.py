"""Resilient LLM-response pipeline for the Architect Blueprint.

No provider needs to know the LDCN OS internal format. This module adapts ANY
reasonable LLM response into a list of ``BlueprintDecision`` instead of demanding
an exact shape. The flow:

    raw text/parsed
        -> Extractor   (JSON / fenced JSON / sliced JSON / partial JSON / YAML / markdown)
        -> Normalizer  (decisions-key / wrapper-key / list / area-map / markdown sections)
        -> Auto Repair (field aliases + safe defaults for optional fields)
        -> Validator   (only area/choice/justification are required)
        -> Recovery    (keep every decision that can be recovered; flag partial)
        -> Diagnostics (what was received, which parser/extractor/normalizer ran, why)

The platform must never again reject a Blueprint just because the model returned
a different format.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.repositories.redaction import redact_text
from app.schemas.architecture_blueprint import BLUEPRINT_AREAS, BlueprintDecision

try:  # YAML is best-effort; the pipeline still works without it.
    import yaml  # type: ignore
except Exception:  # noqa: BLE001
    yaml = None  # type: ignore


# Field-name aliases models commonly use → our canonical field.
_FIELD_ALIASES: dict[str, str] = {
    "decision": "choice",
    "selected": "choice",
    "recommendation": "choice",
    "value": "choice",
    "option": "choice",
    "tech": "choice",
    "technology": "choice",
    "rationale": "justification",
    "reason": "justification",
    "why": "justification",
    "reasoning": "justification",
    "explanation": "justification",
    "alternatives": "alternatives_considered",
    "alternatives_weighed": "alternatives_considered",
    "options_considered": "alternatives_considered",
    "trade_offs": "tradeoffs",
    "trade-offs": "tradeoffs",
    "deps": "dependencies",
    "depends_on": "dependencies",
    "requirements": "requirement_links",
    "requirement_refs": "requirement_links",
    "reconsider": "when_to_reconsider",
    "when_reconsider": "when_to_reconsider",
}

# Area-name synonyms → canonical area.
_AREA_SYNONYMS: dict[str, str] = {
    "front-end": "frontend", "front end": "frontend", "ui": "frontend", "client": "frontend",
    "back-end": "backend", "back end": "backend", "server": "backend", "api_layer": "backend",
    "db": "database", "banco": "database", "banco de dados": "database", "data": "database",
    "persistence": "database", "datastore": "database",
    "authentication": "auth", "autenticacao": "auth", "autenticação": "auth",
    "authz": "authorization", "autorizacao": "authorization", "autorização": "authorization",
    "api": "apis", "endpoints": "apis", "contracts": "apis",
    "integration": "integrations", "integracoes": "integrations", "integrações": "integrations",
    "observabilidade": "observability", "monitoring": "observability", "monitoramento": "observability",
    "test": "tests", "testes": "tests", "qa": "tests",
    "deployment": "deploy", "devops": "deploy", "infra": "deploy", "infrastructure": "deploy",
}

_LIST_FIELDS = {
    "alternatives_considered", "tradeoffs", "risks", "dependencies",
    "requirement_links", "evidence",
}
_STR_FIELDS = {
    "impact", "when_to_reconsider", "confidence_basis", "context",
    "scalability_impact", "security_impact", "cost_impact", "maintainability_impact",
}


@dataclass
class RawResponseRecord:
    """Phase 1 — the raw response is ALWAYS captured, never discarded. Secrets in
    the prompt/response are redacted before storage."""

    provider: str | None
    model: str | None
    prompt_chars: int
    raw_response: str
    raw_hash: str
    tokens: dict[str, int] = field(default_factory=dict)
    latency_ms: int = 0
    temperature: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "prompt_chars": self.prompt_chars,
            "raw_excerpt": self.raw_response[:4000],
            "raw_hash": self.raw_hash,
            "tokens": self.tokens,
            "latency_ms": self.latency_ms,
            "temperature": self.temperature,
        }


@dataclass
class PipelineDiagnostics:
    """Phase 7 — rich diagnostics. Never just 'Blueprint inválido'."""

    extractor_used: str = "none"
    normalizer_used: str = "none"
    parser_used: str = "none"
    decisions_found: int = 0
    areas_present: list[str] = field(default_factory=list)
    areas_missing: list[str] = field(default_factory=list)
    repaired_fields: list[str] = field(default_factory=list)
    dropped: list[dict[str, Any]] = field(default_factory=list)
    partial: bool = False
    recovered: bool = False
    reason: str = ""
    raw_excerpt: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "extractor_used": self.extractor_used,
            "normalizer_used": self.normalizer_used,
            "parser_used": self.parser_used,
            "decisions_found": self.decisions_found,
            "areas_present": self.areas_present,
            "areas_missing": self.areas_missing,
            "repaired_fields": sorted(set(self.repaired_fields)),
            "dropped": self.dropped,
            "partial": self.partial,
            "recovered": self.recovered,
            "reason": self.reason,
            "raw_excerpt": self.raw_excerpt,
        }


@dataclass
class BlueprintParseResult:
    decisions: list[BlueprintDecision]
    diagnostics: PipelineDiagnostics
    raw_record: RawResponseRecord

    @property
    def ok(self) -> bool:
        return bool(self.decisions)


# --------------------------------------------------------------------------- #
# Phase 2 — Extractor
# --------------------------------------------------------------------------- #

_FENCE_RE = re.compile(r"```(?:json|ya?ml|jsonc)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def _balance_close(blob: str) -> str:
    """Append the closers needed to balance a truncated JSON object/array, so a
    response cut off by max_tokens (even mid-value) can still be recovered. Uses
    an opener stack so closers come out in the correct nesting order."""
    stack: list[str] = []
    in_str = escape = False
    for ch in blob:
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()
    suffix = '"' if in_str else ""
    suffix += "".join("}" if opener == "{" else "]" for opener in reversed(stack))
    # Drop a dangling key with no value (e.g. '..."choice":') before closing.
    if suffix:
        blob = re.sub(r',?\s*"[^\"]*"\s*:\s*$', "", blob)
    return blob + suffix


def _loads_lenient(blob: str) -> Any | None:
    blob = blob.strip()
    if not blob:
        return None
    # Strip trailing commas (",}" / ",]") which most strict parsers reject.
    no_trailing = re.sub(r",(\s*[}\]])", r"\1", blob)
    for attempt in (blob, no_trailing, _balance_close(no_trailing)):
        try:
            return json.loads(attempt)
        except Exception:  # noqa: BLE001
            continue
    return None


def _slice_balanced(text: str) -> str | None:
    """Return the substring from the first '{'/'[' to its matching close, so prose
    around a JSON object/array is ignored."""
    start = min(
        [i for i in (text.find("{"), text.find("[")) if i != -1] or [-1]
    )
    if start == -1:
        return None
    opener = text[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    # Unbalanced (truncated output): take from start to the last closer seen.
    last = max(text.rfind("}"), text.rfind("]"))
    return text[start : last + 1] if last > start else None


def extract_structured(text: str, parsed: Any | None) -> tuple[Any | None, str]:
    """Return (candidate, extractor_name). Tries the broadest set of shapes."""
    if isinstance(parsed, (dict, list)) and parsed:
        return parsed, "parsed_json"

    text = text or ""
    direct = _loads_lenient(text)
    if isinstance(direct, (dict, list)):
        return direct, "raw_json"

    for fenced in _FENCE_RE.findall(text):
        candidate = _loads_lenient(fenced)
        if isinstance(candidate, (dict, list)):
            return candidate, "fenced_json"
        if yaml is not None:
            try:
                y = yaml.safe_load(fenced)
                if isinstance(y, (dict, list)):
                    return y, "fenced_yaml"
            except Exception:  # noqa: BLE001
                pass

    sliced = _slice_balanced(text)
    if sliced:
        candidate = _loads_lenient(sliced)
        if isinstance(candidate, (dict, list)):
            return candidate, "sliced_json"

    if yaml is not None and text.strip():
        try:
            y = yaml.safe_load(text)
            if isinstance(y, (dict, list)):
                return y, "yaml"
        except Exception:  # noqa: BLE001
            pass

    return None, "none"


# --------------------------------------------------------------------------- #
# Phase 3 — Normalizer
# --------------------------------------------------------------------------- #

_WRAPPER_KEYS = ("decisions", "blueprint", "architecture", "areas", "design", "decision_list", "items")
_MD_HEADING_RE = re.compile(r"^\s{0,3}(?:#{1,4}\s+|\*\*|-\s+|\d+[.)]\s+)?([A-Za-zÀ-ÿ /_-]{3,30})\s*[:：]\s*(.+)$")


def _looks_like_decision(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    keys = {k.lower() for k in value.keys()}
    return bool(keys & {"area", "choice", "decision", "value", "recommendation", "selected"})


def normalize_to_decision_dicts(candidate: Any | None, text: str) -> tuple[list[dict[str, Any]], str]:
    """Return (list of raw decision dicts, normalizer_name)."""
    # 1) A plain list of decision-like dicts.
    if isinstance(candidate, list):
        dicts = [d for d in candidate if isinstance(d, dict)]
        if dicts:
            return dicts, "list"

    if isinstance(candidate, dict):
        # 2) A wrapper key holding the list (decisions / blueprint / areas / ...).
        for key in _WRAPPER_KEYS:
            inner = _get_ci(candidate, key)
            if isinstance(inner, list):
                dicts = [d for d in inner if isinstance(d, dict)]
                if dicts:
                    return dicts, f"wrapper:{key}"
            if isinstance(inner, dict):
                # Nested wrapper (e.g. {"blueprint": {"decisions": [...]}}) —
                # recurse so a decisions/area-map one level down is still found.
                nested, nested_name = normalize_to_decision_dicts(inner, text)
                if nested:
                    return nested, f"wrapper:{key}>{nested_name}"

        # 3) The dict itself is already one decision.
        if _looks_like_decision(candidate):
            return [candidate], "single"

        # 4) The dict maps area -> choice (string) or area -> {choice,...}.
        mapped = _area_map_to_decisions(candidate)
        if mapped:
            return mapped, "area_map"

    # 5) Last resort: parse markdown "Area: choice" sections from raw text.
    md = _markdown_sections_to_decisions(text)
    if md:
        return md, "markdown_sections"

    return [], "none"


def _get_ci(d: dict[str, Any], key: str) -> Any:
    for k, v in d.items():
        if k.lower() == key.lower():
            return v
    return None


def _area_map_to_decisions(d: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw_area, body in d.items():
        area = _canonical_area(str(raw_area))
        if area is None:
            continue
        if isinstance(body, str):
            out.append({"area": area, "choice": body})
        elif isinstance(body, dict):
            out.append({**body, "area": area})
        elif isinstance(body, list) and body and all(isinstance(x, str) for x in body):
            out.append({"area": area, "choice": body[0], "alternatives_considered": body[1:]})
    return out


_MD_PURE_HEADING_RE = re.compile(r"^\s{0,3}#{1,4}\s+(.+?)\s*$")


def _markdown_sections_to_decisions(text: str) -> list[dict[str, Any]]:
    lines = (text or "").splitlines()
    out: list[dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Form A — inline "Area: choice" (one line).
        inline = _MD_HEADING_RE.match(line)
        if inline:
            area = _canonical_area(inline.group(1))
            choice = inline.group(2).strip()
            if area and choice:
                out.append({"area": area, "choice": choice})
                i += 1
                continue
        # Form B — heading "## Area" followed by body line(s) as the choice.
        heading = _MD_PURE_HEADING_RE.match(line)
        if heading:
            area = _canonical_area(heading.group(1))
            if area:
                body: list[str] = []
                j = i + 1
                while j < len(lines) and lines[j].strip() and not _MD_PURE_HEADING_RE.match(lines[j]) and not _MD_HEADING_RE.match(lines[j]):
                    body.append(lines[j].strip())
                    j += 1
                if body:
                    out.append({"area": area, "choice": body[0], "justification": " ".join(body[1:])})
                    i = j
                    continue
        i += 1
    # De-dup by area, keep first.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for d in out:
        if d["area"] not in seen:
            seen.add(d["area"])
            unique.append(d)
    return unique


def _canonical_area(raw: str) -> str | None:
    norm = raw.strip().lower().strip("#*-: ").strip()
    if norm in BLUEPRINT_AREAS:
        return norm
    if norm in _AREA_SYNONYMS:
        return _AREA_SYNONYMS[norm]
    # Partial contains match (e.g. "Frontend (web)").
    for area in BLUEPRINT_AREAS:
        if area in norm:
            return area
    for syn, area in _AREA_SYNONYMS.items():
        if syn in norm:
            return area
    return None


# --------------------------------------------------------------------------- #
# Phase 4/5 — Auto Repair + Validation
# --------------------------------------------------------------------------- #

def _coerce_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None and str(v).strip()]
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [str(value)]


def auto_repair_decision(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Phase 4 — map aliases and fill safe defaults. Never fail because an
    OPTIONAL field is missing. Returns (clean dict, repaired field names)."""
    repaired: list[str] = []
    clean: dict[str, Any] = {}

    # Apply field-name aliases first.
    for key, value in raw.items():
        canonical = _FIELD_ALIASES.get(str(key).strip().lower(), str(key).strip().lower())
        if canonical not in clean or not clean.get(canonical):
            clean[canonical] = value

    # Area.
    area = _canonical_area(str(clean.get("area", ""))) if clean.get("area") else None
    if not area:
        # Sometimes the area is implied by a 'name'/'title' field.
        for hint in ("name", "title", "component", "layer"):
            if clean.get(hint):
                area = _canonical_area(str(clean[hint]))
                if area:
                    break
    clean["area"] = area or clean.get("area") or "backend"
    if not _canonical_area(str(clean["area"])):
        clean["area"] = str(clean["area"]).strip().lower()

    # Choice (required).
    if not str(clean.get("choice", "")).strip():
        clean["choice"] = "Não especificado pelo provider"
        repaired.append("choice")

    # Justification (required by us, optional from the model).
    if not str(clean.get("justification", "")).strip():
        clean["justification"] = "Justificativa não fornecida pelo provider."
        repaired.append("justification")

    # Optional list fields default to [].
    for f in _LIST_FIELDS:
        if not clean.get(f):
            if f not in clean:
                repaired.append(f)
            clean[f] = _coerce_list(clean.get(f))
        else:
            clean[f] = _coerce_list(clean.get(f))

    # Optional string fields default to "".
    for f in _STR_FIELDS:
        value = clean.get(f)
        clean[f] = str(value) if value is not None else ""

    # confidence coercion.
    conf = clean.get("confidence")
    try:
        clean["confidence"] = max(0.0, min(1.0, float(conf))) if conf is not None else 0.0
    except (TypeError, ValueError):
        clean["confidence"] = 0.0

    # Drop unknown keys so model_validate stays clean.
    allowed = set(BlueprintDecision.model_fields.keys())
    clean = {k: v for k, v in clean.items() if k in allowed}
    return clean, repaired


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def parse_blueprint_response(
    *,
    text: str,
    parsed: Any | None,
    provider: str | None = None,
    model: str | None = None,
    prompt: str = "",
    tokens: dict[str, int] | None = None,
    latency_ms: int = 0,
    temperature: float | None = None,
) -> BlueprintParseResult:
    raw_text = text or ""
    raw_record = RawResponseRecord(
        provider=provider,
        model=model,
        prompt_chars=len(prompt or ""),
        raw_response=redact_text(raw_text),
        raw_hash=hashlib.sha256(raw_text.encode("utf-8", "ignore")).hexdigest(),
        tokens=tokens or {},
        latency_ms=latency_ms,
        temperature=temperature,
    )
    diag = PipelineDiagnostics(raw_excerpt=redact_text(raw_text)[:800])

    candidate, extractor = extract_structured(raw_text, parsed)
    diag.extractor_used = extractor

    raw_dicts, normalizer = normalize_to_decision_dicts(candidate, raw_text)
    diag.normalizer_used = normalizer

    decisions: list[BlueprintDecision] = []
    seen_areas: set[str] = set()
    for raw_decision in raw_dicts:
        clean, repaired = auto_repair_decision(raw_decision)
        diag.repaired_fields.extend(repaired)
        try:
            decision = BlueprintDecision.model_validate(clean)
        except Exception as exc:  # noqa: BLE001 — recovery: skip only the broken one
            diag.dropped.append({"area": clean.get("area"), "reason": type(exc).__name__})
            continue
        if decision.area in seen_areas:
            continue
        seen_areas.add(decision.area)
        decisions.append(decision)

    diag.parser_used = "resilient_pipeline"
    diag.decisions_found = len(decisions)
    diag.areas_present = sorted(seen_areas)
    diag.areas_missing = [a for a in BLUEPRINT_AREAS if a not in seen_areas]
    diag.recovered = bool(diag.dropped) and bool(decisions)
    diag.partial = bool(decisions) and (bool(diag.areas_missing) or bool(diag.dropped))

    if not decisions:
        diag.reason = (
            "Nenhuma decisão arquitetural pôde ser extraída da resposta. "
            f"Extractor='{extractor}', Normalizer='{normalizer}'. "
            "A resposta bruta foi preservada para inspeção."
        )
    elif diag.partial:
        diag.reason = (
            f"Blueprint parcialmente gerado: {len(decisions)} decisão(ões) recuperada(s); "
            f"áreas ausentes: {', '.join(diag.areas_missing) or 'nenhuma'}."
        )
    else:
        diag.reason = f"Blueprint completo: {len(decisions)} decisão(ões)."

    return BlueprintParseResult(decisions=decisions, diagnostics=diag, raw_record=raw_record)
