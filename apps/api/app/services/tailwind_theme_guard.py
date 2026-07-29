from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

EventSink = Callable[[dict[str, Any]], None]

# TailwindThemeGuard: shadcn/ui's globals.css convention emits a fixed, well-known
# set of CSS custom properties (--background, --border, etc. under :root/.dark) and
# relies on tailwind.config.ts mapping each one into a Tailwind color token (e.g.
# border: "hsl(var(--border))"). The generation prompt only says "use Tailwind +
# shadcn" with no shared contract between the two files, so the agent reliably
# reproduces the CSS-variable boilerplate but inconsistently wires the matching
# config, and `npm run build` then fails with "The `border-border` class does not
# exist." This gate detects the shadcn signature in globals.css and deterministically
# completes tailwind.config.ts BEFORE the first build - the same "validate + fix
# before the command that would fail" shape as DependencyRegistry for package.json.

_GLOBALS_CSS_CANDIDATES = (
    "src/app/globals.css", "app/globals.css", "src/styles/globals.css", "styles/globals.css",
)
_TAILWIND_CONFIG_CANDIDATES = (
    "tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs",
)

_ROOT_BLOCK_RE = re.compile(r":root\s*\{([^}]*)\}")
_CSS_VAR_RE = re.compile(r"--([\w-]+)\s*:")

# shadcn/ui's default-theme variable names, unchanged since the project's first
# release. Present together they're an unambiguous signature that this globals.css
# was authored against shadcn's convention (as opposed to a hand-rolled palette).
_SHADCN_SIGNATURE = {
    "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
    "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
    "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground",
    "border", "input", "ring",
}
_SIGNATURE_THRESHOLD = 10  # of 18 known vars; tolerates a themed subset/renames

_SHADCN_COLOR_TOKENS: dict[str, str] = {
    "border": '"hsl(var(--border))"',
    "input": '"hsl(var(--input))"',
    "ring": '"hsl(var(--ring))"',
    "background": '"hsl(var(--background))"',
    "foreground": '"hsl(var(--foreground))"',
    "primary": '{\n          DEFAULT: "hsl(var(--primary))",\n          foreground: "hsl(var(--primary-foreground))",\n        }',
    "secondary": '{\n          DEFAULT: "hsl(var(--secondary))",\n          foreground: "hsl(var(--secondary-foreground))",\n        }',
    "destructive": '{\n          DEFAULT: "hsl(var(--destructive))",\n          foreground: "hsl(var(--destructive-foreground))",\n        }',
    "muted": '{\n          DEFAULT: "hsl(var(--muted))",\n          foreground: "hsl(var(--muted-foreground))",\n        }',
    "accent": '{\n          DEFAULT: "hsl(var(--accent))",\n          foreground: "hsl(var(--accent-foreground))",\n        }',
    "popover": '{\n          DEFAULT: "hsl(var(--popover))",\n          foreground: "hsl(var(--popover-foreground))",\n        }',
    "card": '{\n          DEFAULT: "hsl(var(--card))",\n          foreground: "hsl(var(--card-foreground))",\n        }',
}


@dataclass
class TailwindThemeFinding:
    token: str
    status: str  # "added" | "already_present" | "unresolved"

    def as_dict(self) -> dict[str, Any]:
        return {"token": self.token, "status": self.status}


@dataclass
class TailwindThemeResult:
    status: str  # "passed" | "fixed" | "skipped"
    globals_css: str | None = None
    tailwind_config: str | None = None
    findings: list[TailwindThemeFinding] = field(default_factory=list)
    dark_mode_added: bool = False

    @property
    def fixed(self) -> bool:
        return self.status == "fixed"

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "globals_css": self.globals_css,
            "tailwind_config": self.tailwind_config,
            "findings": [item.as_dict() for item in self.findings],
            "dark_mode_added": self.dark_mode_added,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }


class TailwindThemeGuard:
    """Deterministic gate: complete tailwind.config.ts's color tokens BEFORE the
    first `npm run build`, whenever globals.css declares the shadcn/ui CSS
    variable convention. Never touches a key the project already declares -
    a customized 'primary' palette, for instance, is left exactly as authored."""

    def validate_and_fix(self, root: Path, *, sink: EventSink | None = None) -> TailwindThemeResult:
        css_path = self._find(root, _GLOBALS_CSS_CANDIDATES)
        config_path = self._find(root, _TAILWIND_CONFIG_CANDIDATES)
        if css_path is None or config_path is None:
            return TailwindThemeResult(status="skipped")

        css_text = css_path.read_text(encoding="utf-8", errors="ignore")
        declared = self._declared_root_vars(css_text)
        if len(declared & _SHADCN_SIGNATURE) < _SIGNATURE_THRESHOLD:
            return TailwindThemeResult(status="skipped")

        config_text = config_path.read_text(encoding="utf-8", errors="ignore")
        missing = [
            key for key in _SHADCN_COLOR_TOKENS
            if not re.search(rf"(?<![\w-]){re.escape(key)}\s*:", config_text)
        ]
        findings = [
            TailwindThemeFinding(token=key, status="already_present")
            for key in _SHADCN_COLOR_TOKENS if key not in missing
        ]

        patched = config_text
        if missing:
            patched, applied = self._inject_colors(patched, missing)
            findings.extend(TailwindThemeFinding(token=key, status="added") for key in applied)
            findings.extend(
                TailwindThemeFinding(token=key, status="unresolved")
                for key in missing if key not in applied
            )
        patched, dark_mode_added = self._ensure_dark_mode(patched)

        changed = patched != config_text
        if changed:
            config_path.write_text(patched, encoding="utf-8")
            self._emit(
                sink,
                "Tailwind Theme Guard: tailwind.config.ts nao mapeava as variaveis CSS "
                "do shadcn/ui declaradas em globals.css; token(s) ausente(s) adicionado(s) "
                "automaticamente antes do build.",
            )

        return TailwindThemeResult(
            status="fixed" if changed else "passed",
            globals_css=css_path.relative_to(root).as_posix(),
            tailwind_config=config_path.relative_to(root).as_posix(),
            findings=findings,
            dark_mode_added=dark_mode_added,
        )

    def _find(self, root: Path, candidates: tuple[str, ...]) -> Path | None:
        for candidate in candidates:
            path = root / candidate
            if path.is_file():
                return path
        return None

    def _declared_root_vars(self, css_text: str) -> set[str]:
        match = _ROOT_BLOCK_RE.search(css_text)
        if not match:
            return set()
        return set(_CSS_VAR_RE.findall(match.group(1)))

    def _inject_colors(self, text: str, missing: list[str]) -> tuple[str, list[str]]:
        colors_match = re.search(r"colors\s*:\s*\{", text)
        if colors_match is not None:
            insert_at = colors_match.end()
            block = "".join(f"\n        {key}: {_SHADCN_COLOR_TOKENS[key]}," for key in missing)
            return text[:insert_at] + block + text[insert_at:], list(missing)
        extend_match = re.search(r"extend\s*:\s*\{", text)
        if extend_match is not None:
            insert_at = extend_match.end()
            body = "".join(f"\n          {key}: {_SHADCN_COLOR_TOKENS[key]}," for key in missing)
            block = f"\n      colors: {{{body}\n      }},"
            return text[:insert_at] + block + text[insert_at:], list(missing)
        return text, []

    def _ensure_dark_mode(self, text: str) -> tuple[str, bool]:
        if re.search(r"darkMode\s*:", text):
            return text, False
        match = re.search(r"=\s*\{", text)
        if match is None:
            return text, False
        insert_at = match.end()
        return text[:insert_at] + '\n  darkMode: ["class"],' + text[insert_at:], True

    @staticmethod
    def _emit(sink: EventSink | None, message: str) -> None:
        if sink is None:
            return
        try:
            sink({"type": "repair_applied", "level": "warning", "message": message})
        except Exception:  # noqa: BLE001 — the guard must never break the build
            pass


tailwind_theme_guard = TailwindThemeGuard()
