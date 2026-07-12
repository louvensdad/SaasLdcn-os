# User LLM Key — Security Validation

The user-owned key is the most sensitive datum in the flow. The `temporary_llm_key_vault`
(`services/user_key_session_service.py::user_key_session`) enforces:

- **RAM only.** Never written to disk/DB/log; lost on process restart by design.
- **Encrypted in memory** (Fernet); decrypted only at the instant a provider client is built.
- **Session TTL** (`user_key_ttl_seconds`, default 3600s): `get`/`status` treat an expired
  entry as absent and purge it. ("usado somente na sessão".)
- **Masked only.** Responses ever expose only a masked tail (`••••cdef`), never the raw key.
- **Per-user isolation**; explicit delete (`DELETE /user-ai-keys/session`) and clear-on-logout.
- **Never returned to the frontend** after being set; **never in the connection-test message**;
  **never included in the modernized project, the analysis report, or any export**;
  **never committed to Git** (export ships only project files; the key never enters the repo).

## Tests
- `test_key_never_exposed_in_responses`: the raw key never appears in `/user-ai-keys/status`
  or `/modernize/llm/providers`; only `••••` masks are present.
- `test_llm_test_invalid_key_fails`: the raw key is absent from the failure response body.
- TTL covered by the vault unit behavior (expired entries return None / drop from status).
