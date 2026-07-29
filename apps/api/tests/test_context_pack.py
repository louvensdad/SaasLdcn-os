from __future__ import annotations

from app.engines.context_pack_builder import build_agent_context, compress_to_budget, module_roots_from_emitted


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


def test_module_roots_from_emitted_finds_nested_manifests_only():
    # Real triplication case (room_8888da7c6195, 2026-07-08): the 'structure'
    # chunk emitted the root pom.xml plus each microservice's own pom.xml; a
    # later chunk (blind to this) must be told about auth-service/common/etc,
    # not about the root manifest itself (which isn't a module to reuse).
    emitted = (
        "pom.xml",
        "auth-service/pom.xml",
        "auth-service/src/main/java/com/x/AuthApplication.java",
        "common/pom.xml",
        "appointment-service/pom.xml",
        "package.json",  # frontend manifest at the project root — not a backend module
    )
    roots = module_roots_from_emitted(emitted)
    assert roots == ("appointment-service", "auth-service", "common")


def test_module_roots_from_emitted_empty_when_nothing_nested():
    assert module_roots_from_emitted(("pom.xml", "README.md")) == ()


def test_build_agent_context_injects_established_module_paths_for_backend():
    mega = "# PROJECT SPECIFICATION\n## Intent\nBuild a marketplace\n"
    context, _ = build_agent_context(
        "backend", mega, module_roots=("auth-service", "common"),
    )
    assert "<established_module_paths>" in context
    assert "auth-service" in context
    assert "common" in context


def test_build_agent_context_skips_module_paths_for_unrelated_roles():
    mega = "# PROJECT SPECIFICATION\n## Intent\nBuild a marketplace\n"
    context, _ = build_agent_context(
        "qa", mega, module_roots=("auth-service", "common"),
    )
    assert "<established_module_paths>" not in context


def test_build_agent_context_no_block_when_no_modules_established_yet():
    mega = "# PROJECT SPECIFICATION\n## Intent\nBuild a marketplace\n"
    context, _ = build_agent_context("backend", mega, module_roots=())
    assert "<established_module_paths>" not in context
