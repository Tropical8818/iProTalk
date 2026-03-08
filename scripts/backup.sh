#!/bin/bash
# iProTalk Database Backup Script
# Usage: ./scripts/backup.sh [backup_dir]
# Cron example: 0 2 * * * /path/to/ipro-talk/scripts/backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

echo "🔄 iProTalk Backup — $TIMESTAMP"

# 1. Backup SQLite database
DB_FILE="$PROJECT_DIR/data/iprotalk.db"
if [ -f "$DB_FILE" ]; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/iprotalk_$TIMESTAMP.db'"
    echo "  ✅ SQLite database backed up"
else
    echo "  ⚠️  SQLite database not found at $DB_FILE"
fi

# 2. Backup Sled message database (tar)
MSG_DB_DIR="$PROJECT_DIR/msg_db"
if [ -d "$MSG_DB_DIR" ]; then
    tar -czf "$BACKUP_DIR/msg_db_$TIMESTAMP.tar.gz" -C "$PROJECT_DIR" msg_db
    echo "  ✅ Message database backed up"
else
    echo "  ⚠️  Message database not found at $MSG_DB_DIR"
fi

# 3. Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "iprotalk_*.db" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "msg_db_*.tar.gz" -mtime +7 -delete 2>/dev/null || true
echo "  🧹 Cleaned backups older than 7 days"

echo "✅ Backup complete → $BACKUP_DIR"
