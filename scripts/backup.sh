#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
orbit_backup_file="backups/orbit-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres pg_dump -U orbit -d orbit -Fc > "$orbit_backup_file"
printf 'Backup written: %s\n' "$orbit_backup_file"
