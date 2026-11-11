#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into the running stack.
# Destructive: replaces the database and upload directories. Test this
# against a scratch environment on a schedule, not for the first time
# during an incident.
#
#   BACKUP_IDENTITY=~/.config/age/key.txt scripts/restore.sh backups/polarsight-….tar.age
set -euo pipefail
file="${1:?backup file}"
: "${BACKUP_IDENTITY:?set BACKUP_IDENTITY to the age private key file}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

sha256sum -c "$file.sha256"
age -d -i "$BACKUP_IDENTITY" "$file" | tar -C "$work" -xf -
cat "$work/MANIFEST"

read -r -p "Replace the database and uploads with this backup? [type RESTORE] " answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }

docker exec -i polarsight-postgres pg_restore -U "${POSTGRES_USER:-polarsight}" -d "${POSTGRES_DB:-polarsight}" --clean --if-exists < "$work/db.dump"
rm -rf apps/api/uploads apps/api/private-uploads
tar -C apps/api -xzf "$work/uploads.tgz"
chmod -R u=rwX,g=rX,o= apps/api/uploads apps/api/private-uploads 2>/dev/null || true
echo "✓ restored. Rotate every secret that was in use at the time of the backup if the backup could have been exposed."
