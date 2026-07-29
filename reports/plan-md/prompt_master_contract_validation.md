# Prompt Master Contract Validation

Date: 2026-05-20

## Contract coverage

- `PromptMasterDocument`
- `PromptMasterSection`
- `PromptMasterValidation`
- `PromptMasterVersion`
- `PromptMasterTrace`
- `PromptMasterPreviewPayload`

## Contract behavior validated

- Prompt Master input accepts a full `ProjectBlueprint`
- Future `blueprint_id` field exists in the request shape but lookup is intentionally not implemented yet
- Prompt Master output preserves:
  - blueprint id
  - project name
  - locale
  - generation mode
  - source blueprint validity
  - version metadata
  - section list
  - validation payload
  - safe trace payload
  - compiled prompt text

## Validation rules

- Invalid request payload returns HTTP `422`
- Invalid source blueprint returns HTTP `200` with `validation.valid=false`
- Missing sections would invalidate the Prompt Master contract
- Trace excludes secrets and only keeps safe blueprint identifiers

## Safety rules enforced

- No LLM call is made
- No code generation is performed
- No stack invention is allowed
- No blueprint mutation is allowed
- No secret material is emitted into trace
