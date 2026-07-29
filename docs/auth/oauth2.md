# OAuth2 authentication

The API supports password authentication plus Google and GitHub OAuth2
Authorization Code flows. A provider identity is stored in `oauth_accounts`,
so one user can link Google and GitHub to the same email address without
creating duplicate users.

## Local configuration

Copy `apps/api/.env.example` to `apps/api/.env` and configure:

```dotenv
DATABASE_URL=postgresql+psycopg2://ldcn:change-me@localhost:5432/ldcn_os
JWT_SECRET=<at-least-32-random-characters>
JWT_REFRESH_SECRET=<different-at-least-32-random-characters>
LDCN_TOKEN_ENC_KEY=<third-at-least-32-random-characters>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GITHUB_CLIENT_ID=<github-client-id>
GITHUB_CLIENT_SECRET=<github-client-secret>
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```

Never commit `.env`. Provider tokens are encrypted at rest. The encryption,
access-token signing, and refresh-token signing keys must be independent.

Apply the schema and start the workspace:

```powershell
cd apps/api
python -m alembic upgrade head
cd ../..
./dev.cmd
```

The default API port is 8000. Set `LDCN_API_PORT` to override it.

## Provider callbacks

Register exactly these callbacks:

| Environment | Google | GitHub |
| --- | --- | --- |
| Local | `http://localhost:8000/api/auth/oauth/google/callback` | `http://localhost:8000/api/auth/oauth/github/callback` |
| Production | `https://api.aicodebase.com.br/api/auth/oauth/google/callback` | `https://api.aicodebase.com.br/api/auth/oauth/github/callback` |

Production origins:

```dotenv
FRONTEND_URL=https://aicodebase.com.br
BACKEND_URL=https://api.aicodebase.com.br
LDCN_ALLOWED_ORIGINS=https://aicodebase.com.br,https://www.aicodebase.com.br
```

## HTTP contract

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/auth/oauth/google` | Start Google OAuth |
| GET | `/api/auth/oauth/google/callback` | Google authorization callback |
| GET | `/api/auth/oauth/github` | Start GitHub OAuth |
| GET | `/api/auth/oauth/github/callback` | GitHub authorization callback |
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/refresh` | Rotate refresh token and issue access token |
| POST | `/api/auth/logout` | Revoke refresh session |
| GET | `/api/auth/me` | Return authenticated user |

FastAPI exposes the OpenAPI contract at `/api/openapi.json` and Swagger UI at
`/api/docs` outside production.

## Security model

- Access JWTs expire after 15 minutes.
- Refresh JWTs expire after 30 days, rotate on use, and are revocable.
- Refresh JWTs are stored only in a Secure, HttpOnly, SameSite cookie; the
  browser callback never receives one in JavaScript or a query string.
- OAuth transactions use a short-lived HttpOnly state cookie, PKCE S256, and a
  Google OIDC nonce.
- Cookie-authenticated mutations reject untrusted browser origins.
- OAuth provider tokens are encrypted before PostgreSQL persistence.
- Authentication endpoints use the auth rate-limit bucket and emit safe audit
  event codes without tokens or passwords.

If a credential has been pasted into chat, logs, source control, or an issue,
revoke it at the provider immediately and create a new one.
