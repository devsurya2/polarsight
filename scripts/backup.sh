#!/usr/bin/env bash
# Encrypted backup of everything worth protecting: the database and
# both upload tiers. Output is one age-encrypted tarball; the private
# key must live outside this host.
#
#   BACKUP_RECIPIENT=age1... scripts/backup.sh /backups
#
# Restore: scripts/restore.sh <file.tar.age>
set -euo pipefail
out_dir="${1:-./backups}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

: "${BACKUP_RECIPIENT:?set BACKUP_RECIPIENT to an age public key (age-keygen)}"
command -v age >/dev/null || { echo "age is required (https://age-encryption.org)"; exit 2; }

mkdir -p "$out_dir"
echo "→ database"
docker exec polarsight-postgres pg_dump -U "${POSTGRES_USER:-polarsight}" -Fc "${POSTGRES_DB:-polarsight}" > "$work/db.dump"
echo "→ uploads"
tar -C apps/api -czf "$work/uploads.tgz" uploads private-uploads 2>/dev/null || tar -C apps/api -czf "$work/uploads.tgz" --files-from /dev/null
cp .env.example "$work/env.example"
printf 'created=%s\nhost=%s\n' "$stamp" "$(hostname)" > "$work/MANIFEST"

echo "→ encrypting"
tar -C "$work" -cf - . | age -r "$BACKUP_RECIPIENT" -o "$out_dir/polarsight-$stamp.tar.age"
sha256sum "$out_dir/polarsight-$stamp.tar.age" > "$out_dir/polarsight-$stamp.tar.age.sha256"
chmod 600 "$out_dir/polarsight-$stamp.tar.age"*
echo "✓ $out_dir/polarsight-$stamp.tar.age"

# Retention: keep 30 days locally; off-site copies are the operator's job.
find "$out_dir" -name 'polarsight-*.tar.age*' -mtime +30 -delete
