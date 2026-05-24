#!/bin/bash
# =============================================================================
# Gym Tracker - Automated PostgreSQL Backup Script
# =============================================================================
#
# Description:
#   Creates a compressed (gzip) backup of the Gym Tracker PostgreSQL database
#   using pg_dump. Retains backups for 7 days and deletes older files.
#
# Usage:
#   ./scripts/backup.sh
#
# Environment Variables:
#   POSTGRES_USER     - Database user (default: gymtracker)
#   POSTGRES_DB       - Database name (default: gymtracker)
#   POSTGRES_HOST     - Database host (default: localhost)
#   POSTGRES_PORT     - Database port (default: 5432)
#   BACKUP_DIR        - Backup directory (default: /backups)
#   BACKUP_RETENTION  - Days to retain backups (default: 7)
#
# Cron Schedule:
#   0 2 * * * /path/to/scripts/backup.sh >> /var/log/gym-tracker-backup.log 2>&1
#
# Restoration:
#   To restore from a backup file:
#     gunzip -k gymtracker_YYYY-MM-DD_HHMMSS.sql.gz
#     psql -U $POSTGRES_USER -d $POSTGRES_DB -f gymtracker_YYYY-MM-DD_HHMMSS.sql
#
#   Or in one step:
#     gunzip -c gymtracker_YYYY-MM-DD_HHMMSS.sql.gz | psql -U $POSTGRES_USER -d $POSTGRES_DB
#
#   For Docker Compose deployments:
#     gunzip -c gymtracker_YYYY-MM-DD_HHMMSS.sql.gz | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
#
# =============================================================================

set -euo pipefail

# Configuration with defaults
POSTGRES_USER="${POSTGRES_USER:-gymtracker}"
POSTGRES_DB="${POSTGRES_DB:-gymtracker}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"

# Generate timestamped filename
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/gymtracker_${TIMESTAMP}.sql.gz"

# Logging helper
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Ensure backup directory exists
if [ ! -d "${BACKUP_DIR}" ]; then
  mkdir -p "${BACKUP_DIR}"
  log "Created backup directory: ${BACKUP_DIR}"
fi

# Perform the backup
log "Starting backup of database '${POSTGRES_DB}' on ${POSTGRES_HOST}:${POSTGRES_PORT}..."

pg_dump \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-password \
  --format=plain \
  --clean \
  --if-exists \
  | gzip > "${BACKUP_FILE}"

# Verify backup was created and is non-empty
if [ -s "${BACKUP_FILE}" ]; then
  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  log "Backup completed successfully: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  log "ERROR: Backup file is empty or was not created!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Delete backups older than retention period
log "Removing backups older than ${BACKUP_RETENTION} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "gymtracker_*.sql.gz" -type f -mtime +${BACKUP_RETENTION} | wc -l)
find "${BACKUP_DIR}" -name "gymtracker_*.sql.gz" -type f -mtime +${BACKUP_RETENTION} -delete

if [ "${DELETED_COUNT}" -gt 0 ]; then
  log "Deleted ${DELETED_COUNT} old backup(s)."
else
  log "No old backups to delete."
fi

log "Backup process complete."
