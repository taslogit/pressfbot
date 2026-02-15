#!/bin/bash
# ─── PostgreSQL Backup Script ─────────────────────────
# Run via cron: 0 3 * * * /app/scripts/backup.sh
# Keeps last 7 daily + 4 weekly backups

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${POSTGRES_DB:-pressf}"
DB_USER="${POSTGRES_USER:-pressf}"
DB_HOST="${DB_HOST:-db}"
DATE=$(date +%Y-%m-%d_%H-%M)
DAY_OF_WEEK=$(date +%u)

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

echo "[$(date)] Starting backup..."

# Create daily backup
DAILY_FILE="$BACKUP_DIR/daily/${DB_NAME}_${DATE}.sql.gz"
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$DAILY_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] Daily backup created: $DAILY_FILE ($(du -h "$DAILY_FILE" | cut -f1))"
else
    echo "[$(date)] ERROR: Backup failed!" >&2
    exit 1
fi

# Keep weekly backup on Sundays
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    cp "$DAILY_FILE" "$BACKUP_DIR/weekly/${DB_NAME}_weekly_${DATE}.sql.gz"
    echo "[$(date)] Weekly backup created"
fi

# Cleanup: remove daily backups older than 7 days
find "$BACKUP_DIR/daily" -name "*.sql.gz" -mtime +7 -delete
echo "[$(date)] Cleaned daily backups older than 7 days"

# Cleanup: remove weekly backups older than 28 days
find "$BACKUP_DIR/weekly" -name "*.sql.gz" -mtime +28 -delete
echo "[$(date)] Cleaned weekly backups older than 28 days"

# Print backup stats
echo "[$(date)] Backup stats:"
echo "  Daily backups: $(ls "$BACKUP_DIR/daily" | wc -l)"
echo "  Weekly backups: $(ls "$BACKUP_DIR/weekly" | wc -l)"
echo "  Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "[$(date)] Backup completed successfully"
