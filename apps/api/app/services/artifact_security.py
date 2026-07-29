from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


class ArtifactSecurityError(RuntimeError):
    """Raised when generated output contains material that must never persist."""


SecretClassification = Literal[
    "REAL_SECRET", "PLACEHOLDER", "TEST_FIXTURE", "DOCUMENTATION_EXAMPLE",
    "SUSPICIOUS", "SAFE_REFERENCE",
]

# Classifications that still hard-block a write. SUSPICIOUS is "ambiguous but
# risky" and stays fail-safe on purpose: it is the diagnostic pipeline
# (RootCauseInvestigator -> CauseValidator -> RepairEngineer, see
# app.engines.pipeline_recovery) that is allowed to downgrade a SUSPICIOUS
# finding after real evidence -- never a silent relaxation of this scanner.
_BLOCKING_CLASSIFICATIONS = {"REAL_SECRET", "SUSPICIOUS"}

_ENV_TEMPLATE_NAMES = {".env.example", ".env.sample", ".env.template", ".env.dist"}
_FORBIDDEN_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks"}
_FORBIDDEN_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials.json"}

# Known real-credential formats. A match here is REAL_SECRET regardless of
# where it lives -- a real AWS key pasted into a test fixture is still a real
# AWS key. (This is deliberately never softened by path/context.)
_KNOWN_SECRET_FORMATS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("pem_private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github_token", re.compile(r"\bgh[opusr]_[A-Za-z0-9_]{24,}\b")),
    ("openai_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
)

# A credential-shaped assignment: SECRET_KEY=, JWT_SECRET=, db_password:, API_KEY=...
# The key fragment allows the token to appear anywhere -- including as the
# very first component (bare "SECRET_KEY", "PASSWORD", "TOKEN") -- which the
# previous regex missed: its mandatory leading `[A-Za-z_]` character class ate
# into the token itself ("SECRET_KEY" -> "S" consumed, remaining "ECRET_KEY"
# no longer starts with "secret"), so identifiers that _start_ with the token
# (the single most common real-world case: SECRET_KEY, PASSWORD, TOKEN) never
# matched at all. The rest of the line (RHS) is captured whole and parsed in
# Python (_extract_literal_value) since Python default-value expressions like
# `Field(default="change-me")` need more than a single quote pair to parse.
_CREDENTIAL_ASSIGNMENT = re.compile(
    r"(?im)(?:^|[ \t])(?:export\s+)?"
    r"(?P<key>[A-Za-z0-9_.]*"
    r"(?:secret|password|passwd|token|api[_-]?key|apikey|private[_-]?key|credential|access[_-]?key)"
    r"[A-Za-z0-9_.]*)"
    # [ \t] only, NOT \s -- \s matches \n too, which previously let a
    # colon-terminated Python control-flow line whose header happens to
    # contain "token"/"secret"/etc (`except jwt.InvalidTokenError:`,
    # `class TokenValidator:`) swallow its entire NEXT line as "rest",
    # misreading the body statement (e.g. `raise ValueError("Token invalido")`)
    # as the value assigned to a nonexistent credential. Confirmed live: this
    # is not a real assignment at all, just a block header followed by its
    # body on the next line.
    r"[ \t]*[:=][ \t]*(?P<rest>[^\r\n]*)$"
)

_ENV_STYLE_EXTENSIONS = {".env", ".properties", ".ini", ".cfg", ".conf", ".toml", ".yaml", ".yml"}

_QUOTED_VALUE = re.compile(r'"([^"\r\n]*)"|\'([^\'\r\n]*)\'')

# Leading \b only: a trailing \b would refuse to match "example" inside
# "example1234567890abcdef" (no boundary between the word char 'e' and the
# following digit), which is exactly how generated placeholders are commonly
# written. Dropping it does not reopen false negatives for e.g. "contest"
# swallowing "test" -- the *leading* boundary still requires a non-word
# character (or start-of-string) immediately before the token.
_PLACEHOLDER_TOKENS = re.compile(
    r"(?i)\b(change-?me|example|placeholder|your[_-][a-z0-9_-]*|dummy|sample|"
    r"insert[_-]your|replace[_-]?me|fake|test(?:[_-]?(?:key|secret|token|value))?|"
    # "stub" is standard mock/placeholder terminology (StubAuthService-style
    # generated code): real bug found live -- "stub-access-token",
    # "stub-refresh-token", "new-stub-refresh-token" were flagged as
    # UNSAFE_TEMPLATE/needing human approval on every single generation that
    # produces a stub service, even though they're obviously not real.
    r"(?:new-)?stub(?:[_-][a-z0-9_-]*)?|"
    r"x{3,}|todo|fixme|redacted)"
    r"|\.\.\.|<[^<>]{0,80}>|\$\{[^{}]{0,80}}|%[A-Za-z_]+%"
)

_HEX_CHARSET = re.compile(r"^[0-9a-fA-F]{20,}$")
_BASE64ISH_CHARSET = re.compile(r"^[A-Za-z0-9+/_=-]{24,}$")


def _extract_literal_value(rest: str) -> str:
    """Best-effort literal value from an assignment RHS: prefer the first
    quoted string (handles `KEY = "value"` and `KEY: str = Field(default="value")`
    alike), else the first bare token up to whitespace/comment (.env style
    `KEY=value123`)."""
    quoted = _QUOTED_VALUE.search(rest)
    if quoted:
        return quoted.group(1) if quoted.group(1) is not None else quoted.group(2)
    bare = re.match(r"[^\s#;,)]+", rest.strip())
    return bare.group(0) if bare else rest.strip()


_PYDANTIC_FIELD_CALL = re.compile(r"=\s*Field\s*\(")
_PYDANTIC_FIELD_DEFAULT_KWARG = re.compile(r"\bdefault\s*=\s*")


def _pydantic_field_literal_value(rest: str) -> tuple[str, bool] | None:
    """A Pydantic `Field(...)` call carries several string kwargs --
    `description`, `title`, `examples`, `alias` -- that document the field but
    never hold its actual value. `_extract_literal_value`'s "first quoted
    string on the line" heuristic previously grabbed whichever of THOSE came
    first (e.g. `refresh_token: str = Field(..., description="Token de
    atualizacao (refresh token)")` classified the human-readable description
    itself as a leaked "refresh_token" secret). Only `default=<literal>` is a
    real value; a bare `Field(...)`/`Field(default_factory=...)` (no literal
    default) means no secret is assigned here at all.

    Returns None when `rest` isn't Field(...)-shaped at all (caller should use
    its normal whole-line extraction). Returns `("", False)` when it IS
    Field-shaped but carries no literal default (caller should treat that as
    SAFE_REFERENCE, never falling back to scanning the rest of the line for an
    unrelated quoted string like `description=`)."""
    if not _PYDANTIC_FIELD_CALL.search(rest):
        return None
    match = _PYDANTIC_FIELD_DEFAULT_KWARG.search(rest)
    if not match:
        return "", False
    tail = rest[match.end():]
    quoted = _QUOTED_VALUE.search(tail)
    if quoted:
        return (quoted.group(1) if quoted.group(1) is not None else quoted.group(2)), True
    return _extract_literal_value(tail), False

# A literal reference into runtime config/env, not a hardcoded value -- exactly
# the "fixed" shape a repair should produce (os.getenv("SECRET_KEY"), not a
# quoted literal).
_ENV_REFERENCE = re.compile(
    r"^(?:os\.(?:environ|getenv)|process\.env|env(?:iron)?\.|config\(|settings\.|getenv\(|"
    r"\$\{|System\.getenv|@Value\()",
    re.IGNORECASE,
)

_TEST_PATH_HINT = re.compile(r"(?i)(^|/)(tests?|__tests__|spec|fixtures?|mocks?)(/|$)")
_DOC_PATH_HINT = re.compile(r"(?i)(^|/)(docs?)(/|$)|\.(?:md|mdx|rst)$|(^|/)readme(\.[a-z]+)?$")


@dataclass
class SecretFinding:
    """One flagged credential-shaped value inside a generated artifact."""

    classification: SecretClassification
    rule: str
    key: str
    line: int
    redacted_value: str
    reason: str

    @property
    def blocking(self) -> bool:
        return self.classification in _BLOCKING_CLASSIFICATIONS


def _shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    counts: dict[str, int] = {}
    for ch in value:
        counts[ch] = counts.get(ch, 0) + 1
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def _redact(value: str) -> str:
    value = value.strip()
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:3]}{'*' * (len(value) - 6)}{value[-3:]}"


def _looks_like_usable_credential(value: str, entropy: float, diversity: int) -> bool:
    """A value dense/random enough to actually work as a credential -- not just
    a heuristic entropy cutoff, since hex-only secrets (JWT signing keys, API
    tokens, digests) top out at exactly log2(16)=4.0 bits/char and would never
    clear a >4.2 general-purpose threshold.

    The base64-ish charset alone is deliberately NOT sufficient: plain alnum
    with no digits (e.g. an underscore-joined English phrase like
    "Some_Descriptive_Constant_Name_Here") also matches that charset and is
    common, legitimate, non-secret code -- only real diversity (upper+lower+
    digit together) combined with the charset counts.
    """
    if _HEX_CHARSET.match(value):
        return True
    if _BASE64ISH_CHARSET.match(value) and diversity >= 3 and len(value) >= 24:
        return True
    # 3.75, not a rounder 3.8: a real regression surfaced live when the
    # write-time gate's classifier was reused by the post-build Quality Gate
    # scanner (previously its own, cruder regex) -- a genuine hardcoded key
    # like "sk_live_real_secret_value_12345" (entropy ~3.79 bits/char, mixed
    # letters+digits, 31 chars) fell just under a 3.8 cutoff and was cleared
    # as SAFE_REFERENCE. Real credentials with an English-word-ish body
    # (common for hand-typed or provider-prefixed secrets, not just
    # machine-random ones) must not be waved through by a threshold this
    # close; the "not usable" default-safe branch above still protects
    # genuinely low-diversity ordinary strings (e.g. diversity < 2 fails
    # before entropy is even considered).
    return entropy >= 3.75 and diversity >= 2 and len(value) >= 20


def _classify_value(
    rest: str, *, path_is_test: bool, path_is_doc: bool, path_is_env_template: bool, path_is_env_style: bool,
) -> tuple[SecretClassification, str]:
    rhs = rest.strip()
    if not rhs:
        return "SAFE_REFERENCE", "empty value"
    if _ENV_REFERENCE.match(rhs):
        return "SAFE_REFERENCE", "value is a runtime env/config lookup, not a hardcoded literal"
    field_default = _pydantic_field_literal_value(rest)
    if field_default is not None:
        # Field(...)-shaped RHS: only `default=<literal>` is a real value --
        # description/title/examples/alias kwargs are documentation, never
        # the field's actual content, and must not be scanned as one.
        field_value, was_quoted = field_default
        if not field_value.strip():
            return "SAFE_REFERENCE", "Field(...) declares no literal default; description/metadata kwargs are not the field's value"
        stripped = field_value.strip()
    else:
        was_quoted = bool(_QUOTED_VALUE.search(rest))
        stripped = _extract_literal_value(rest).strip()
    if not stripped:
        return "SAFE_REFERENCE", "empty value"
    for _, pattern in _KNOWN_SECRET_FORMATS:
        if pattern.search(stripped):
            return "REAL_SECRET", "matches a known real-credential format (provider key/token/PEM)"
    if _PLACEHOLDER_TOKENS.search(stripped):
        if path_is_doc:
            return "DOCUMENTATION_EXAMPLE", "placeholder wording inside documentation"
        if path_is_test:
            return "TEST_FIXTURE", "placeholder wording inside a test/fixture path"
        return "PLACEHOLDER", "value contains recognized placeholder wording"
    if len(stripped) < 12:
        return "SAFE_REFERENCE", "value too short to be a usable credential"
    if not was_quoted and not path_is_env_style:
        # An unquoted RHS in a source file (Python/JS/Java/...) is a variable
        # or attribute reference (`self.password = incoming_password`), not a
        # string literal -- only .env/.properties/.ini/.yaml-style files use
        # bare unquoted literals idiomatically. Applying entropy scoring here
        # would flag ordinary variable-to-variable assignment as a secret.
        return "SAFE_REFERENCE", "unquoted value in source code reads as a variable/attribute reference, not a literal"
    entropy = _shannon_entropy(stripped)
    diversity = sum([any(c.isupper() for c in stripped), any(c.islower() for c in stripped), any(c.isdigit() for c in stripped)])
    usable = _looks_like_usable_credential(stripped, entropy, diversity)
    if path_is_doc:
        return ("SUSPICIOUS" if usable else "DOCUMENTATION_EXAMPLE"), "long value inside documentation"
    if path_is_test:
        return ("SUSPICIOUS" if usable else "TEST_FIXTURE"), "long value inside a test/fixture path"
    if path_is_env_template and not usable:
        return "PLACEHOLDER", "low-entropy value inside an env template file"
    if usable:
        return "REAL_SECRET", f"usable-credential shape (entropy {entropy:.2f} bits/char, {len(stripped)} chars, charset diversity {diversity})"
    # Real bug found live: this default (non-doc/non-test/non-env-template)
    # branch previously fell through to SUSPICIOUS unconditionally whenever a
    # quoted string >=12 chars wasn't recognized placeholder wording -- even
    # though `_looks_like_usable_credential` (this function's own dedicated
    # "would this actually work as a secret" check) had ALREADY said no. That
    # made ordinary long string literals with no digits/uppercase -- a Zod
    # validation message ("validation_required"), UI copy, a log message, a
    # SQL fragment -- block on every single generation containing one, purely
    # because they happened to sit on a "key: value"-shaped line whose key
    # contained a credential-ish word (`password: z.string().min(1,
    # 'validation_required')`). Trust the same signal doc/test paths already
    # trust: not usable means not a secret, not merely "ambiguous".
    return "SAFE_REFERENCE", f"value does not look like a usable credential (entropy {entropy:.2f} bits/char, {len(stripped)} chars, charset diversity {diversity})"


def classify_secret_findings(relative_path: str, content: str) -> list[SecretFinding]:
    """Deterministic, context-aware secret classifier.

    Considers filename/extension/location (test, docs, .env.example), known
    real-credential prefixes, placeholder wording, entropy, length, and
    whether the value is a literal or a runtime env/config reference. Never
    used to disable detection of a known real-credential format (see
    _KNOWN_SECRET_FORMATS) -- only the ambiguous "generic assignment" case is
    context-sensitive.
    """
    normalized = relative_path.replace("\\", "/").strip("/")
    name = Path(normalized).name.lower()
    path_is_test = bool(_TEST_PATH_HINT.search(normalized))
    path_is_doc = bool(_DOC_PATH_HINT.search(normalized))
    path_is_env_template = name in _ENV_TEMPLATE_NAMES
    path_is_env_style = path_is_env_template or Path(name).suffix.lower() in _ENV_STYLE_EXTENSIONS
    findings: list[SecretFinding] = []
    for rule_name, pattern in _KNOWN_SECRET_FORMATS:
        for match in pattern.finditer(content):
            line = content.count("\n", 0, match.start()) + 1
            findings.append(SecretFinding(
                classification="REAL_SECRET", rule=rule_name, key="<inline>",
                line=line, redacted_value=_redact(match.group(0)),
                reason="matches a known real-credential format",
            ))
    for match in _CREDENTIAL_ASSIGNMENT.finditer(content):
        key = match.group("key")
        rest = match.group("rest")
        line = content.count("\n", 0, match.start()) + 1
        classification, reason = _classify_value(
            rest, path_is_test=path_is_test, path_is_doc=path_is_doc,
            path_is_env_template=path_is_env_template, path_is_env_style=path_is_env_style,
        )
        findings.append(SecretFinding(
            classification=classification, rule="credential_assignment", key=key,
            line=line, redacted_value=_redact(_extract_literal_value(rest)), reason=reason,
        ))
    return findings


def classify_secret_content(relative_path: str, content: str | bytes) -> list[SecretFinding]:
    """Same as classify_secret_findings but accepts bytes (best-effort utf-8)."""
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            return []
    else:
        text = content
    return classify_secret_findings(relative_path, text)


_QUOTED_SEGMENT_RE = re.compile(r'(["\']).*?\1')


def _redact_finding_line(content: str, line_number: int) -> str:
    lines = content.splitlines(keepends=True)
    idx = line_number - 1
    if not (0 <= idx < len(lines)):
        return content
    original = lines[idx]
    # Check for a match directly rather than comparing before/after text: a
    # line whose value is ALREADY "change-me" (e.g. two findings on the same
    # line, the first already redacted it) produces an identical string on a
    # genuine match too, which previously looked exactly like "no match" and
    # fell through to the bare-value fallback, stripping the quotes back off.
    if _QUOTED_SEGMENT_RE.search(original):
        lines[idx] = _QUOTED_SEGMENT_RE.sub('"change-me"', original, count=1)
    else:
        # Bare/unquoted assignment (.env-style KEY=value, no quotes).
        lines[idx] = re.sub(r"([:=]\s*)\S+", r"\1change-me", original, count=1)
    return "".join(lines)


def sanitize_untrusted_source(content: str, *, path: str = "") -> str:
    """Replace credential values while preserving source/config assignment
    syntax. Uses classify_secret_findings -- the SAME classifier
    artifact_block_reason uses -- as the single source of truth for "what
    counts as a secret". Previously used a separate, narrower regex with its
    own hardcoded 16-char minimum, which let a short-but-real value (e.g. a
    14-char hardcoded password) through unsanitized even though the write-time
    gate (already using the fuller classifier) would still correctly block it
    once the sanitized-but-still-flagged content reached ProjectWriter."""
    findings = classify_secret_findings(path or "untrusted-source.txt", content)
    for finding in findings:
        if finding.blocking:
            content = _redact_finding_line(content, finding.line)
    # Defense in depth for a known-format literal appearing outside any
    # `KEY=value` assignment shape (e.g. pasted in a comment or concatenated
    # string) -- classify_secret_findings' _KNOWN_SECRET_FORMATS pass above
    # already covers these too, but a plain substring replace here is a cheap,
    # redundant-but-harmless second pass.
    content = re.sub(r"AKIA[0-9A-Z]{16}", "AWS_ACCESS_KEY_ID_REDACTED", content)
    content = re.sub(r"\bgh[opusr]_[A-Za-z0-9_]{24,}\b", "GIT_TOKEN_REDACTED", content)
    content = re.sub(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b", "LLM_KEY_REDACTED", content)
    return content


def artifact_block_reason(relative_path: str, content: str | bytes | None = None) -> str:
    normalized = relative_path.replace("\\", "/").strip("/")
    name = Path(normalized).name.lower()
    if name.startswith(".env") and name not in _ENV_TEMPLATE_NAMES:
        return "real environment files are forbidden; generate .env.example only"
    if name in _FORBIDDEN_NAMES or Path(name).suffix.lower() in _FORBIDDEN_SUFFIXES:
        return "private key or credential files are forbidden"
    if content is None:
        return ""
    findings = classify_secret_content(normalized, content)
    blocking = [f for f in findings if f.blocking]
    if blocking:
        kinds = sorted({f.classification.lower() for f in blocking})
        return f"high-confidence secret material is forbidden ({', '.join(kinds)})"
    return ""


def assert_artifact_safe(relative_path: str, content: str | bytes | None = None) -> None:
    reason = artifact_block_reason(relative_path, content)
    if reason:
        raise ArtifactSecurityError(f"Artifact '{relative_path}' blocked: {reason}.")
