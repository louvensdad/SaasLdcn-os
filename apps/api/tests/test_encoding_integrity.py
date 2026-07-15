from __future__ import annotations

from pathlib import Path


_SUSPICIOUS = ("Ãƒ", "Ã¢", "Â·", "â€", "Ã§", "Ã£", "\ufffd")


def test_runtime_and_ui_sources_have_no_mojibake_signatures():
    root = Path(__file__).resolve().parents[3]
    search_roots = (
        root / "apps" / "api" / "app",
        root / "apps" / "web" / "app",
        root / "apps" / "web" / "components",
        root / "apps" / "web" / "lib",
    )
    findings: list[str] = []
    for search_root in search_roots:
        for path in search_root.rglob("*"):
            if path.suffix not in {".py", ".ts", ".tsx"} or ".next" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            for line_number, line in enumerate(text.splitlines(), start=1):
                if any(marker in line for marker in _SUSPICIOUS):
                    findings.append(f"{path.relative_to(root)}:{line_number}")
    assert findings == []