# Conta tab: real sessions / 2FA / consent-revoke / activity-history / Workspace

Follows `reports/settings_pixel_fidelity_refactor.md`. That pass deliberately dropped several fields
from the Conta reference screenshot (`docs/design-system/systemsettings-reference-conta.png.png`)
because no backend existed for them. This pass builds the real backend and wires the fields up —
no placeholder/fake data — so the tab matches the reference with genuinely working features.

## What's new (real, not mocked)

**Login-session tracking.** New `user_sessions` table (one row per issued refresh token) capturing
IP + a coarse UA-derived device label ("macOS · Chrome 126"), created/last-seen timestamps, and a
revoked flag. Populated in `AuthService._issue_tokens`; sessions rotate across refresh-token
rotation (same row, new jti) and are revoked on logout / password change / account deletion.

**TOTP two-factor auth.** `users.is_2fa_enabled` + `users.totp_secret_encrypted` (Fernet at rest via
existing `encrypt_secret`). Enroll → verify → enabled; disable requires a valid current code. Uses
`pyotp` (added to `requirements.txt`); manual-entry key + `otpauth://` URI, no QR dependency.

**Consent revocation.** `POST /auth/me/consent/revoke` clears `consent_accepted_at`, audit-logged.

**Activity-history export.** `GET /auth/me/activity-export` — downloadable JSON of the user's
audit-log events (distinct from the existing full data export).

**Real Workspace card.** Uses the pre-existing but previously frontend-unreachable
`GET /workspaces/default` + `GET /workspaces/{id}/members` (name, caller's role, member count).

## Files

**Backend (`apps/api`):**
- `alembic/versions/20260715_k1_sessions_and_2fa.py` — new migration (upgrade+downgrade verified).
- `app/models/user.py`, `app/models/__init__.py` — `UserSession` model + two `User` columns.
- `app/repositories/user_repository.py` — session CRUD, 2FA secret/enable/disable, consent revoke,
  5 new `SAFE_EVENT_CODES`.
- `app/core/security.py` — shared `client_ip` (de-dup'd from `rate_limit.py`), `mask_ip`,
  `describe_device` (dependency-free UA parse).
- `app/services/auth_service.py`, `app/routes/auth.py`, `app/schemas/auth.py` — request-context
  threading + 8 new endpoints + schemas; `UserPublic` gains `is_2fa_enabled`.
- `requirements.txt` — `pyotp>=2.9.0`.
- `tests/test_auth_sessions_2fa.py` — 9 new tests (session list/revoke/revoke-others, 2FA
  enroll/verify/wrong-code/disable, consent revoke, activity export, secret-never-leaks).

**Frontend (`apps/web`):**
- `packages/contracts/auth.contract.ts` (+`is_2fa_enabled`, 4 new response types),
  `packages/contracts/tenant.contract.ts` (new: `Workspace`, `WorkspaceMember`).
- `lib/api/{types,endpoints,client}.ts` — types re-export, endpoints, 11 new apiClient methods.
- `components/ui/modal.tsx` — new shared portal dialog (focus-trap/Escape/restore-focus), extracted
  so the three settings dialogs don't re-roll `DeleteResourceButton`'s inline boilerplate.
- `components/settings/{manage-sessions,two-factor,workspace-members}-dialog.tsx` — new.
- `components/settings/account-tab.tsx` — rebuilt Sessão-e-segurança / Gerenciamento-de-dados cards
  + new Workspace card; session/workspace data fetched on mount (fault-isolated: card degrades
  rather than erroring the page).
- 4 i18n dictionaries — ~55 new `settings.account.*` / `settings.workspace.*` keys each.
- `tests/settings.spec.ts` — new "account tab shows real session, 2FA and workspace context" test +
  mocks; fixture user gains `is_2fa_enabled`.

## Round 2 — full pixel parity with the reference

A second pass closed the remaining visual gaps the user flagged ("não está batendo 100%" + photo
upload not working):

- **Photo upload (real).** New `users.avatar_url` column (migration `20260716_l1_user_avatar`),
  `GET/PUT /auth/me/avatar` (validates image data URL, hard-caps ~300 KB). Client resizes the picked
  file to a ≤256px JPEG in-canvas (`lib/image/avatar.ts`) before upload; camera button is now a real
  file picker, with a "remove photo" affordance. Avatar deliberately kept out of `UserPublic` (fetched
  separately) so it doesn't bloat every auth/refresh response.
- **"Fundador · Administrador"** role line derived from workspace owner + account role.
- **"Workspace atual"** labeled block with icon in the hero.
- **Notificações por e-mail / Resumo semanal** toggles — persisted client preferences (see caveat
  below).
- **"Gerenciar sessões"** button in the security card.
- **Zona de perigo** now 3 rows matching the reference: "Sair da conta" (now signs out **all**
  devices via new `POST /auth/me/logout-all`), "Desativar conta" (new `POST /auth/me/deactivate` —
  sets `is_active=False` + revokes everything, blocks re-login), "Excluir conta".
- Renamed the section "Zona de perigo" and fixed a pre-existing mojibake ("Versao" → "Versão").
- 6 new backend tests (avatar round-trip / rejects non-image + oversized / not leaked in
  user+export, deactivate blocks access, logout-all revokes every session).

## Honesty caveats (unchanged discipline)

No 2FA backup/recovery codes (TOTP only). The email/weekly-summary toggles **persist a real user
choice but nothing consumes them yet** — no mailer service exists in the backend; they're a
forward-ready opt-in, not proof emails are sent (documented in the store). No workspace
rename/invite UI (no endpoint — Workspace card is read + view-only roster). Account deactivation
blocks login but there's no self-service reactivation flow yet.

## Verification

- Backend: `test_auth_sessions_2fa.py` (9) + `test_auth_security_lgpd.py` (19) green; migration
  upgrade+downgrade verified against real dev DB then re-applied; full suite run for regressions.
- Frontend: `npm run typecheck` clean, `npm run lint` 0 errors (39 warnings = unchanged baseline),
  `npm run build` clean (`/settings` 23.3 kB / 369 kB First Load).
- Playwright `settings.spec.ts` (8) green against the running dev server (temp reuse-existing config
  since :3000/:8001 were occupied by the user's live env — temp config removed after).
- Real screenshot captured and compared against the reference: profile hero, Sessão-e-segurança
  (último login / device / masked IP + Ativo / 2FA Ativado + Desativar / Sessões ativas + count /
  Alterar senha), Gerenciamento de dados (3 rows), Workspace card, Zona de risco — all match.
