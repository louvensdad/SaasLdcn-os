# Runtime Registry Validation

Date: 2026-05-20

## Scope

Validated the runtime registry and framework-to-runtime modeling.

## Runtimes Included

- `jvm`
- `nodejs`
- `bun`
- `deno`
- `python_runtime`
- `dotnet_runtime`
- `php_runtime`
- `go_runtime`

## Validation Results

- `GET /api/registry/runtimes`: passed
- Runtime filtering in the Wizard by selected language: passed
- Compatibility validation for invalid runtime/framework pairing: passed
- `spring_boot` requiring `java + jvm`: passed
- `nestjs` requiring `typescript/javascript + nodejs`: passed

## Evidence

- Backend test `test_validate_selection_invalid_framework_runtime_pair`: passed
- Wizard runtime step updates correctly after language selection: validated in runtime
- Frontend online Wizard flow: passed

## Result

Runtime is now modeled as its own layer and is no longer conflated with framework or stack.
