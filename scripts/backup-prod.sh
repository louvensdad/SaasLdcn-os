#!/usr/bin/env bash
# Daily backup for the production stack (docker-compose.prod.yml): a
# PostgreSQL dump and a tarball of the MinIO artifact volume. Intended to run
# from the host, once a day, via crontab:
#
#   0 3 * * * /opt/sistema-de-engenharia-enterprise/scripts/backup-prod.sh >> /var/log/ldcn-backup.log 2>&1
#
# A dedicated backup container would be over-engineering for a single-VPS
# deploy; this script re-uses the running stack via `docker compose exec` /
# `docker run --volumes-from`, same tools already on the host.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
BACKUP_DIR="backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

# shellcheck disable=SC1091
source .env.prod

echo "[$STAMP] Dumping PostgreSQL..."
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/postgres-${STAMP}.sql.gz"

echo "[$STAMP] Archiving MinIO volume..."
MINIO_VOLUME="$(docker volume ls -q --filter name=minio_data | head -n1)"
if [[ -z "$MINIO_VOLUME" ]]; then
  echo "warning: minio_data volume not found; skipping MinIO backup." >&2
else
  docker run --rm \
    -v "${MINIO_VOLUME}:/data:ro" \
    -v "$(pwd)/${BACKUP_DIR}:/backup" \
    alpine:latest \
    tar czf "/backup/minio-${STAMP}.tar.gz" -C /data .
fi

echo "[$STAMP] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -type f \( -name 'postgres-*.sql.gz' -o -name 'minio-*.tar.gz' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "[$STAMP] Done: $BACKUP_DIR/postgres-${STAMP}.sql.gz + minio-${STAMP}.tar.gz"
