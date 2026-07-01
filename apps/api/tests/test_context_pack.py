from __future__ import annotations

from app.engines.context_pack_builder import compress_to_budget


def test_priority_truncate_keeps_mandatory_tail_sections():
    # A huge non-priority body follows the mandatory tail sections. Blind head
    # truncation (old behavior) would drop Business rules / Localization; the
    # priority-aware last resort must keep them (audit AI3).
    mega = (
        "# PROJECT SPECIFICATION\n"
        "## Intent\nBuild an ERP\n"
        "## Non-functional\n" + ("perf and scale detail. " * 4000) + "\n"
        "## Business rules (priority zero)\n- Only admins approve orders\n"
        "## Localization rules (NON-NEGOTIABLE)\n- Output must be pt-BR\n"
    )
    out, steps = compress_to_budget(mega, 3000)

    assert len(out) <= 3000
    assert "priority_truncate" in steps
    assert "Build an ERP" in out
    assert "Only admins approve orders" in out  # mandatory business rule survives
    assert "Output must be pt-BR" in out         # NON-NEGOTIABLE localization survives
    # The bulky non-priority body is dropped rather than mutilating the backbone.
    assert "perf and scale detail. perf and scale detail." not in out


def test_compress_noop_when_within_budget():
    text = "# PROJECT SPECIFICATION\n## Intent\nsmall\n"
    out, steps = compress_to_budget(text, 10_000)
    assert out == text and steps == []
