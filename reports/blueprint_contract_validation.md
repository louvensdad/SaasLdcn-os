# Blueprint Contract Validation

Date: 2026-05-20

## Contract coverage

- `ProjectBlueprint`
- `TechnologyGraph`
- `ArchitectureProfile`
- `ComplexityProfile`
- `BlueprintValidation`
- `BlueprintRecommendation`
- `BlueprintPreviewPayload`

## Validated fields

- `technology_graph` normalizes:
  - language
  - runtime
  - framework
  - architecture
- `architecture_profile` returns:
  - architecture id
  - complexity level
  - deployment complexity
  - scalability profile
  - required infrastructure
  - recommended patterns
- `complexity_profile` returns:
  - overall score
  - learning curve
  - implementation effort
  - infrastructure cost
  - maintenance cost
  - team size recommendation
  - risk level
- `validation` returns:
  - valid
  - errors
  - warnings
  - suggestions
- `recommendations` returns structured items with:
  - type
  - message
  - severity
  - related item id

## Validation behavior

- Structurally invalid payloads return HTTP `422`
- Processable but incompatible selections return HTTP `200` with `validation.valid=false`
- Incompatibilities validated include:
  - language/runtime/framework mismatch
  - framework/architecture mismatch
  - archetype/framework mismatch
  - endpoint/capability mismatch
  - unknown modules
  - unsupported locale
  - invalid generation mode

## Runtime validation

- Backend preview endpoint returns normalized blueprint payloads for valid selections
- Invalid selections surface explicit errors in the contract instead of hidden backend failures
- Frontend types now consume the blueprint contract directly for preview rendering
