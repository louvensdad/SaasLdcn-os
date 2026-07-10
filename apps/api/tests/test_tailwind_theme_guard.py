from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from app.services.tailwind_theme_guard import tailwind_theme_guard

# The exact globals.css shadcn/ui variable block and tailwind.config.ts that a
# real generation produced (java-services-marketplace-landing-platform_a78064a51746,
# 2026-07-08): the CSS declares the full shadcn token set, but the config only
# extends a custom 'primary' palette, so `npm run build` failed with "The
# `border-border` class does not exist."
_BROKEN_GLOBALS_CSS = """@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
"""

_BROKEN_TAILWIND_CONFIG = """import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
"""

_PLAIN_GLOBALS_CSS = """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
}
"""


def _project(globals_css: str | None, tailwind_config: str | None) -> Path:
    root = Path(tempfile.mkdtemp(prefix="ldcn-tailwind-guard-"))
    if globals_css is not None:
        css_path = root / "src" / "app" / "globals.css"
        css_path.parent.mkdir(parents=True, exist_ok=True)
        css_path.write_text(globals_css, encoding="utf-8")
    if tailwind_config is not None:
        (root / "tailwind.config.ts").write_text(tailwind_config, encoding="utf-8")
    return root


def test_detects_shadcn_signature_and_completes_missing_color_tokens():
    root = _project(_BROKEN_GLOBALS_CSS, _BROKEN_TAILWIND_CONFIG)
    try:
        result = tailwind_theme_guard.validate_and_fix(root)
        assert result.status == "fixed"
        assert result.dark_mode_added is True

        patched = (root / "tailwind.config.ts").read_text(encoding="utf-8")
        for token in ("border", "input", "ring", "background", "foreground",
                      "secondary", "destructive", "muted", "accent", "popover", "card"):
            assert f'{token}: "hsl(var(--{token}))"' in patched or f"{token}: {{" in patched, token
        assert 'darkMode: ["class"]' in patched

        # The pre-existing custom 'primary' palette (50/900 numeric scale) must
        # survive untouched - the guard must never introduce a duplicate key
        # that would silently shadow it in the JS object literal.
        assert '50: "#eff6ff"' in patched
        assert patched.count("primary:") == 1

        # Balanced braces: a crude but effective guard against structurally
        # corrupting the TypeScript object literal.
        assert patched.count("{") == patched.count("}")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_second_run_is_idempotent():
    root = _project(_BROKEN_GLOBALS_CSS, _BROKEN_TAILWIND_CONFIG)
    try:
        tailwind_theme_guard.validate_and_fix(root)
        second = tailwind_theme_guard.validate_and_fix(root)
        assert second.status == "passed"
        assert all(f.status == "already_present" for f in second.findings)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_skips_non_shadcn_projects():
    root = _project(_PLAIN_GLOBALS_CSS, _BROKEN_TAILWIND_CONFIG)
    try:
        original = (root / "tailwind.config.ts").read_text(encoding="utf-8")
        result = tailwind_theme_guard.validate_and_fix(root)
        assert result.status == "skipped"
        assert (root / "tailwind.config.ts").read_text(encoding="utf-8") == original
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_skips_when_no_tailwind_config_present():
    root = _project(_BROKEN_GLOBALS_CSS, None)
    try:
        result = tailwind_theme_guard.validate_and_fix(root)
        assert result.status == "skipped"
    finally:
        shutil.rmtree(root, ignore_errors=True)
