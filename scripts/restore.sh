#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -ne 2 ]; then printf 'Usage: scripts/restore.sh backups/file.dump NEW_DATABASE_NAME\n'; exit 1; fi
case "$2" in orbit_restore_*) ;; *) printf 'Use a new database name beginning with orbit_restore_. Existing orbit database is never overwritten.\n'; exit 1;; esac
case "$2" in *[!a-zA-Z0-9_]*) printf 'Invalid database name\n';exit 1;; esac
docker compose exec -T postgres createdb -U orbit "$2"
docker compose exec -T postgres pg_restore -U orbit -d "$2" --no-owner --exit-on-error < "$1"
docker compose exec -T postgres psql -U orbit -d "$2" -c 'SELECT count(*) AS items FROM "Item";'
printf 'Restored into %s. Verify before switching DATABASE_URL.\n' "$2"
