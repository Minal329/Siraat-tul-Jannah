#!/usr/bin/env bash
# Nightly backup of everything that can't be rebuilt: the database and uploaded files
# (payment screenshots, voice notes). Keeps the last 14 days in deploy/backups/.
# Run from cron (see docs/deployment.md), and copy backups/ OFF the server too.
set -euo pipefail
cd "$(dirname "$0")"

stamp=$(date +%Y-%m-%d_%H%M)
mkdir -p backups

docker compose exec -T db pg_dump -U siraat -d siraat --format=custom > "backups/db_${stamp}.dump"
docker compose exec -T api tar -czf - -C /app uploads > "backups/uploads_${stamp}.tar.gz"

find backups -type f -mtime +14 -delete
echo "Backup done: backups/db_${stamp}.dump, backups/uploads_${stamp}.tar.gz"
