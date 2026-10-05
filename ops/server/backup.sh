#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$root_dir/.env.production"
reason=

if [ "${1:-}" = "--reason" ] && [[ "${2:-}" =~ ^(scheduled|manual|pre-deploy)$ ]] && [ "$#" -eq 2 ]; then
  reason=$2
else
  echo "用法：$0 --reason <scheduled|manual|pre-deploy>" >&2
  exit 2
fi

if [ ! -f "$env_file" ]; then
  echo "错误：缺少 $env_file。" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

# shellcheck disable=SC1091
. "$root_dir/ops/server/backup-lib.sh"
require_backup_environment

for command_name in docker openssl sha256sum flock df readlink; do
  command -v "$command_name" >/dev/null 2>&1 || {
    backup_error "缺少命令 $command_name。"
    exit 1
  }
done
docker compose version >/dev/null 2>&1 || {
  backup_error "需要 Docker Compose v2。"
  exit 1
}

compose() {
  docker compose --project-directory "$root_dir" --env-file "$env_file" -f "$root_dir/compose.yaml" "$@"
}

backup_dir=$(resolve_backup_dir "${BACKUP_DIR:-$root_dir/backups}")
exec 9>"$backup_dir/.backup.lock"
if ! flock -n 9; then
  backup_error "另一个备份任务正在运行。"
  exit 1
fi

temporary_dump=
temporary_manifest=
temporary_checksum=
cleanup() {
  close_backup_snapshot
  [ -z "$temporary_dump" ] || rm -f -- "$temporary_dump"
  [ -z "$temporary_manifest" ] || rm -f -- "$temporary_manifest"
  [ -z "$temporary_checksum" ] || rm -f -- "$temporary_checksum"
}
trap cleanup EXIT INT TERM

open_backup_snapshot
available_kib=$(df -Pk "$backup_dir" | awk 'NR == 2 { print $4 }')
[[ "$available_kib" =~ ^[0-9]+$ ]] || {
  backup_error "无法读取备份磁盘剩余空间。"
  exit 1
}
require_backup_space "$BACKUP_DATABASE_BYTES" "$((available_kib * 1024))"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
stem="campus-sweep-$timestamp"
validate_backup_stem "$stem"
temporary_dump="$backup_dir/.$stem.dump.enc.tmp"
temporary_manifest="$backup_dir/.$stem.manifest.json.tmp"
temporary_checksum="$backup_dir/.$stem.dump.enc.sha256.tmp"

compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=gzip:6 --snapshot="$BACKUP_SNAPSHOT_ID" \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_PASSWORD -out "$temporary_dump"
chmod 600 -- "$temporary_dump"

encrypted_sha=$(sha256sum -- "$temporary_dump" | awk '{ print $1 }')
printf '%s  %s\n' "$encrypted_sha" "$stem.dump.enc" > "$temporary_checksum"
printf '{\n  "formatVersion": 1,\n  "createdAt": "%s",\n  "reason": "%s",\n  "database": "%s",\n  "migrationCount": %s,\n  "rowCounts": {\n    "User": %s,\n    "School": %s,\n    "Building": %s,\n    "Dormitory": %s,\n    "SweepRecord": %s,\n    "SweepAudit": %s,\n    "Session": %s\n  },\n  "encryptedSha256": "%s"\n}\n' \
  "$created_at" "$reason" "$POSTGRES_DB" "$BACKUP_MIGRATION_COUNT" "$BACKUP_USER_COUNT" "$BACKUP_SCHOOL_COUNT" \
  "$BACKUP_BUILDING_COUNT" "$BACKUP_DORMITORY_COUNT" "$BACKUP_SWEEP_RECORD_COUNT" "$BACKUP_SWEEP_AUDIT_COUNT" \
  "$BACKUP_SESSION_COUNT" "$encrypted_sha" > "$temporary_manifest"

close_backup_snapshot
publish_backup_set "$backup_dir" "$stem" "$temporary_dump" "$temporary_manifest" "$temporary_checksum"
temporary_dump=
temporary_manifest=
temporary_checksum=
prune_backup_sets "$backup_dir" "$(date -u +%s)" 7
printf '备份完成：%s\n' "$backup_dir/$stem.dump.enc"
