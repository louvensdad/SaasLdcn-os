from __future__ import annotations

from app.main import create_application


# Contract surface consumed by apps/web/lib/api/client.ts and meta-factory.ts.
# Keep this explicit so a backend route rename or method change fails in CI
# before it becomes a dead control in the frontend.
FRONTEND_OPERATIONS = {
    ("get", "/api/health"),
    ("post", "/api/auth/register"),
    ("post", "/api/auth/login"),
    ("post", "/api/auth/refresh"),
    ("post", "/api/auth/logout"),
    ("get", "/api/auth/me"),
    ("patch", "/api/auth/me"),
    ("delete", "/api/auth/me"),
    ("post", "/api/auth/me/password"),
    ("post", "/api/auth/me/consent"),
    ("get", "/api/auth/me/export"),
    ("get", "/api/localization/locales"),
    ("get", "/api/localization/dictionary/{locale}"),
    ("post", "/api/localization/preview"),
    ("post", "/api/localization/validate"),
    ("get", "/api/stacks"),
    ("get", "/api/registry/stacks"),
    ("get", "/api/registry/languages"),
    ("get", "/api/registry/runtimes"),
    ("get", "/api/registry/frameworks"),
    ("get", "/api/registry/frameworks/{framework_id}"),
    ("get", "/api/registry/architectures"),
    ("get", "/api/registry/archetypes"),
    ("get", "/api/registry/archetypes/{archetype_id}"),
    ("get", "/api/registry/capabilities"),
    ("get", "/api/registry/business-modules"),
    ("get", "/api/registry/endpoints"),
    ("get", "/api/registry/compatibility"),
    ("get", "/api/registry/languages/{language_id}/frameworks"),
    ("get", "/api/registry/frameworks/{framework_id}/architectures"),
    ("get", "/api/registry/frameworks/{framework_id}/archetypes"),
    ("get", "/api/registry/stacks/{stack_id}/archetypes"),
    ("get", "/api/registry/stacks/{stack_id}/capabilities"),
    ("get", "/api/registry/business-modules/{module_id}/endpoints"),
    ("post", "/api/registry/validate-selection"),
    ("get", "/api/languages/{language_id}/profile"),
    ("get", "/api/languages/{language_id}/frameworks"),
    ("get", "/api/languages/{language_id}/architectures"),
    ("get", "/api/languages/{language_id}/archetypes"),
    ("get", "/api/languages/{language_id}/capabilities"),
    ("get", "/api/languages/{language_id}/recommendations"),
    ("get", "/api/frameworks/{framework_id}/specialist-profile"),
    ("get", "/api/frameworks/{framework_id}/recommended-architectures"),
    ("get", "/api/frameworks/{framework_id}/recommended-capabilities"),
    ("get", "/api/frameworks/{framework_id}/recommended-endpoints"),
    ("get", "/api/frameworks/{framework_id}/readiness"),
    ("get", "/api/infrastructure/components"),
    ("get", "/api/infrastructure/categories"),
    ("get", "/api/infrastructure/components/{component_id}"),
    ("post", "/api/infrastructure/recommendations"),
    ("post", "/api/dependency-graph/preview"),
    ("post", "/api/dependency-graph/impact"),
    ("post", "/api/dependency-graph/readiness"),
    ("post", "/api/dependency-graph/risks"),
    ("post", "/api/engineering/readiness"),
    ("post", "/api/engineering/team-profile"),
    ("post", "/api/engineering/delivery-estimate"),
    ("post", "/api/engineering/operational-burden"),
    ("post", "/api/system-design/architecture-topology"),
    ("post", "/api/system-design/infrastructure-topology"),
    ("post", "/api/system-design/runtime-flow"),
    ("post", "/api/system-design/dependency-visualization"),
    ("post", "/api/system-design/risk-zones"),
    ("post", "/api/system-design/readiness-zones"),
    ("post", "/api/system-design/team-topology"),
    ("post", "/api/system-design/deployment-topology"),
    ("post", "/api/system-design/snapshot"),
    ("post", "/api/architectural-graph/preview"),
    ("post", "/api/blueprints/preview"),
    ("post", "/api/prompt-master/preview"),
    ("post", "/api/gatekeeper/preview"),
    ("post", "/api/generation/handoff-preview"),
    ("post", "/api/backend-generation/preview"),
    ("post", "/api/backend-generation/run"),
    ("get", "/api/backend-generation/templates"),
    ("get", "/api/backend-generation/status/{generation_id}"),
    ("post", "/api/generation/local-run"),
    ("get", "/api/generation/{project_id}/files"),
    ("get", "/api/generation/{project_id}/file-content"),
    ("post", "/api/generation/{project_id}/prepare-download"),
    ("get", "/api/generation/{project_id}/download"),
    ("post", "/api/generated-projects/{project_id}/quality-check"),
    ("post", "/api/git/export/preview"),
    ("post", "/api/git/export/github"),
    ("post", "/api/git/export/gitlab"),
    ("get", "/api/git/export/status/{export_id}"),
    ("get", "/api/integrations/git/{provider}"),
    ("post", "/api/integrations/git/{provider}/connect"),
    ("post", "/api/integrations/git/{provider}/validate"),
    ("delete", "/api/integrations/git/{provider}"),
    ("post", "/api/repositories"),
    ("get", "/api/templates"),
    ("get", "/api/templates/catalog"),
    ("get", "/api/templates/categories"),
    ("get", "/api/templates/recommended"),
    ("get", "/api/templates/{template_id}"),
    ("get", "/api/templates/{template_id}/compatibility"),
    ("get", "/api/skills"),
    ("get", "/api/skills/categories"),
    ("get", "/api/skills/recommended"),
    ("post", "/api/skills/preview"),
    ("get", "/api/skills/{skill_id}"),
    ("get", "/api/system-status"),
    ("get", "/api/roadmap"),
    ("get", "/api/projects"),
    ("post", "/api/projects/save-from-wizard"),
    ("get", "/api/projects/{project_id}"),
    ("patch", "/api/projects/{project_id}"),
    ("delete", "/api/projects/{project_id}"),
    ("get", "/api/downloads"),
    ("post", "/api/meta-factory/orchestrate"),
    ("post", "/api/meta-factory/generate"),
    ("get", "/api/meta-factory/{project_id}/files"),
    ("get", "/api/meta-factory/{project_id}/file-content"),
    ("post", "/api/meta-factory/{project_id}/prepare-download"),
    ("get", "/api/meta-factory/{project_id}/download"),
}


def test_every_frontend_operation_exists_in_openapi():
    paths = create_application().openapi()["paths"]
    backend_operations = {
        (method, path)
        for path, operations in paths.items()
        for method in operations
    }

    missing = FRONTEND_OPERATIONS - backend_operations
    assert not missing, f"Frontend operations missing from FastAPI: {sorted(missing)}"


def test_frontend_does_not_depend_on_planned_501_extensions():
    planned_paths = {
        "/api/contracts/upload-pdf",
        "/api/contracts/analyze",
        "/api/contracts/{contract_id}/report",
    }

    consumed_paths = {path for _, path in FRONTEND_OPERATIONS}
    assert consumed_paths.isdisjoint(planned_paths)
