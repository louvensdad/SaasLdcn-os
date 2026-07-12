# Template Dependency Audit

## Inventory of deterministic/template surfaces
| Surface | File | Type | Verdict |
|---|---|---|---|
| PromptMaster.md renderer | `engines/prompt_master_md_engine.py` | Fixed 32-section template | **Template-dominant** (document is 100% templated; only spec values vary) |
| Legacy blueprint PromptMaster | `engines/prompt_master_engine.py` | Deterministic sections | Template |
| Deterministic spec fallback | `engines/llm/mock_adapter.py::_build_project_spec` | Hardcoded fields | **Template-dominant** (governs no-key path) |
| Mock code skeletons | `engines/llm/mock_adapter.py::_files_*` | Per-stack fixed files | Template |
| Backend generation | `engines/backend_generation_engine.py::BACKEND_TEMPLATES` | Hardcoded templates | **Template-dominant (≈100%)** |
| Static site generation | `engines/local_generation_engine.py` + `TemplateRenderService` | Fixed static template | **Template-dominant (≈100%)** |
| Codebase analysis | `engines/codebase_analysis_engine.py` | Regex/heuristics | Deterministic (acceptable for a scanner) |
| Modernize scores | `engines/modernize_analysis_engine.py::score_codebase` | Heuristic formula | Deterministic |
| Quality gate | `engines/quality_gate_engine.py` | Deterministic checks | Deterministic (acceptable — a gate should be) |
| Auto-repair | `engines/auto_repair_engine.py` | Fixed file templates | Template (acceptable — scaffolding fixers) |

## Acceptable vs risk
**Mandatory/acceptable templates** (a gate, a secret scanner, scaffolding fixers, frontend MSW
mocks, opinionated Clean-Architecture layout): fine — these *should* be deterministic.

**Dominant templates (risk):**
- The **PromptMaster.md document** is ≥95% template by construction; the "intelligence" is only
  the interpolated spec — and zero when no key.
- The **no-key path everywhere** (mock spec + mock skeletons) is ~100% template.
- The **two standalone generation engines** (backend_generation, local_generation) are ~100%
  template with no AI at all.

## The 60% rule
For the **default (no-key) experience**, well over 60% — effectively ~95%+ — of the delivered
artifact (PromptMaster, generated skeleton) comes from fixed templates. **Flagged as RISK.**
For the **with-key Meta-Factory path**, generated *code* is LLM-authored (template-light), but
the *PromptMaster document* remains template-dominant regardless of key.
