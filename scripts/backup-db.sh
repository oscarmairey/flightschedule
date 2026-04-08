#!/usr/bin/env bash
# FlightSchedule — daily Postgres backup → encrypted dump → R2 (cavok-db-backups).
#
# Reads from .env at the project root:
#   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
#   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT
#   BACKUP_PASSPHRASE  (REQUIRED — used for symmetric GPG encryption)
#
# Pipeline:
#   docker exec cavok-db pg_dump
#   | gzip
#   | gpg --symmetric --batch --passphrase "$BACKUP_PASSPHRASE" --cipher-algo AES256
#   | aws s3 cp - s3://cavok-db-backups/cavok-YYYYMMDDHHMMSS.sql.gz.gpg
#
# Requirements on the host:
#   - docker
#   - gpg
#   - aws CLI (configured to use the R2 endpoint)
#
# Run manually:
#   ./scripts/backup-db.sh
#
# Cron (daily 03:00 Europe/Paris):
#   0 3 * * * /opt/cavok/scripts/backup-db.sh >> /var/log/cavok-backup.log 2>&1
#
# CRITICAL: the bucket cavok-db-backups MUST be fully private (no custom
# domain, no r2.dev URL). Same rule as the photo bucket.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER not set}"
: "${POSTGRES_DB:?POSTGRES_DB not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY not set}"
: "${R2_ENDPOINT:?R2_ENDPOINT not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE not set}"

BACKUP_BUCKET="${BACKUP_BUCKET:-cavok-db-backups}"
TS="$(date +%Y%m%d%H%M%S)"
KEY="cavok-${TS}.sql.gz.gpg"

echo "[$(date)] Starting backup → s3://${BACKUP_BUCKET}/${KEY}"

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
docker exec cavok-db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip \
  | gpg --symmetric --batch --yes \
        --passphrase "${BACKUP_PASSPHRASE}" \
        --cipher-algo AES256 \
  | AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
    aws s3 cp - "s3://${BACKUP_BUCKET}/${KEY}" \
      --endpoint-url "${R2_ENDPOINT}"

echo "[$(date)] Backup complete: ${KEY}"

# Retention: delete backups older than 30 days
AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 ls "s3://${BACKUP_BUCKET}/" --endpoint-url "${R2_ENDPOINT}" \
  | awk '{print $4}' \
  | grep -E '^cavok-[0-9]{14}\.sql\.gz\.gpg$' \
  | while read -r OLD; do
      OLD_TS="${OLD#cavok-}"
      OLD_TS="${OLD_TS%.sql.gz.gpg}"
      OLD_DATE="${OLD_TS:0:8}"
      CUTOFF="$(date -d '30 days ago' +%Y%m%d)"
      if [[ "$OLD_DATE" < "$CUTOFF" ]]; then
        echo "[$(date)] Deleting old backup ${OLD}"
        AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
        AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
        aws s3 rm "s3://${BACKUP_BUCKET}/${OLD}" --endpoint-url "${R2_ENDPOINT}"
      fi
    done
