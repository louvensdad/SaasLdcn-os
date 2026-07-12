# Secure Extension Placeholder Endpoints

## Phase

Fase B creates safe backend placeholders only. No real User Key Boost, Git Export, PDF processing, AI call, external API call, generation, or persistence is active.

## Response

Every endpoint returns HTTP `501 Not Implemented` with:

```json
{
  "status": "planned",
  "active": false,
  "message": "Feature planned but not active in V1 Foundation.",
  "phase": "future_secure_extension"
}
```

## Endpoints

- `GET /api/user-ai-keys/status`
- `POST /api/user-ai-keys/session`
- `DELETE /api/user-ai-keys/session`
- `POST /api/git/export/github`
- `POST /api/git/export/gitlab`
- `GET /api/git/export/status/{export_id}`
- `POST /api/contracts/upload-pdf`
- `POST /api/contracts/analyze`
- `GET /api/contracts/{contract_id}/report`

## Safety

POST handlers do not parse request bodies. Submitted API keys, Git tokens, or PDF bytes are ignored, not saved, not returned, and not passed to any provider or file operation.
