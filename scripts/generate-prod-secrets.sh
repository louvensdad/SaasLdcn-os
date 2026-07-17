#!/usr/bin/env bash
# Generates .env.prod (git-ignored) for docker-compose.prod.yml from
# .env.prod.example, filling in every secret with a fresh random value.
#
# Usage: bash scripts/generate-prod-secrets.sh [--force]
#   --force  overwrite an existing .env.prod (otherwise the script refuses,
#            so a re-run never silently rotates secrets under a running stack)
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=".env.prod"
EXAMPLE=".env.prod.example"

if [[ -f "$TARGET" && "${1:-}" != "--force" ]]; then
  echo "error: $TARGET already exists. Pass --force to overwrite (this rotates every secret)." >&2
  exit 1
fi

if [[ ! -f "$EXAMPLE" ]]; then
  echo "error: $EXAMPLE not found; run this from the repo root." >&2
  exit 1
fi

gen_hex32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    python3 -c "import secrets; print(secrets.token_hex(32))"
  fi
}

cp "$EXAMPLE" "$TARGET"

POSTGRES_PASSWORD="$(gen_hex32)"
MINIO_ROOT_PASSWORD="$(gen_hex32)"
LDCN_SECRET_KEY="$(gen_hex32)"
LDCN_TOKEN_ENC_KEY="$(gen_hex32)"
LDCN_METRICS_BEARER_TOKEN="$(gen_hex32)"

# All generated values are plain hex (0-9a-f only), so they are always safe to
# drop straight into a connection-string URL or a sed replacement with no
# escaping concerns.
sed -i \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
  -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}|" \
  -e "s|^LDCN_SECRET_KEY=.*|LDCN_SECRET_KEY=${LDCN_SECRET_KEY}|" \
  -e "s|^LDCN_TOKEN_ENC_KEY=.*|LDCN_TOKEN_ENC_KEY=${LDCN_TOKEN_ENC_KEY}|" \
  -e "s|^LDCN_METRICS_BEARER_TOKEN=.*|LDCN_METRICS_BEARER_TOKEN=${LDCN_METRICS_BEARER_TOKEN}|" \
  "$TARGET"

chmod 600 "$TARGET"

cat <<EOF

Generated $TARGET (chmod 600) with fresh secrets.

Before it's safe to remove: review PUBLIC_HOST/PUBLIC_ORIGIN at the top of
$TARGET -- it defaults to this VPS's bare IP. Update it once a real domain
points here (and flip "tls internal" to "tls you@example.com" in
infrastructure/caddy/Caddyfile).

Remaining one-time steps before "docker compose -f docker-compose.prod.yml
--env-file .env.prod up -d --build":
  1. docker build -t ldcn/sandbox-runtime:2026.07 infrastructure/docker/sandbox-runtime
  2. docker compose -f infrastructure/docker/sandbox-runtime/compose.yml up -d
  3. chown -R 10001:10001 apps/api/app/data generated-projects
  4. docker compose -f docker-compose.prod.yml --env-file .env.prod config   # validate first
EOF
