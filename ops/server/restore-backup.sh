#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$root_dir/.env.production"
mode=${1:-}
shift || true
backup_path=
report_path=
confirmed_empty_server=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup)
      [ "$#" -ge 2 ] || { echo "错误：--backup 需要文件路径。" >&2; exit 2; }
      backup_path=$2
      shift 2
      ;;
    --report)
      [ "$mode" = verify ] && [ "$#" -ge 2 ] || { echo "错误：--report 仅用于 verify。" >&2; exit 2; }
      report_path=$2
      shift 2
      ;;
    --confirm-empty-server)
      [ "$mode" = disaster-recovery ] || { echo "错误：确认选项仅用于灾难恢复。" >&2; exit 2; }
      confirmed_empty_server=1
      shift
      ;;
    *) echo "错误：未知选项 $1。" >&2; exit 2 ;;
  esac
done

case "$mode" in
  verify|disaster-recovery) ;;
  *) echo "用法：$0 <verify|disaster-recovery> --backup <绝对路径> [--report <绝对路径>] [--confirm-empty-server]" >&2; exit 2 ;;
esac
[ -n "$backup_path" ] || { echo "错误：必须指定备份文件。" >&2; exit 2; }
[ "$mode" != disaster-recovery ] || [ "$confirmed_empty_server" -eq 1 ] || {
  echo "错误：灾难恢复必须明确传入 --confirm-empty-server。" >&2
  exit 2
}
[[ "$backup_path" = /* ]] || { echo "错误：备份路径必须是绝对路径。" >&2; exit 2; }

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

backup_path=$(readlink -f -- "$backup_path")
backup_dir=$(dirname -- "$backup_path")
backup_name=$(basename -- "$backup_path")
[[ "$backup_name" =~ ^(campus-sweep-[0-9]{8}T[0-9]{6}Z)\.dump\.enc$ ]] || { echo "错误：备份文件名无效。" >&2; exit 1; }
stem=${BASH_REMATCH[1]}
validate_backup_stem "$stem"
manifest="$backup_dir/$stem.manifest.json"
checksum_file="$backup_dir/$stem.dump.enc.sha256"
[ -f "$manifest" ] && [ -f "$checksum_file" ] || { echo "错误：备份缺少清单或校验文件。" >&2; exit 1; }

expected_sha=$(sed -nE "s/^[[:space:]]*\"encryptedSha256\"[[:space:]]*:[[:space:]]*\"([a-f0-9]{64})\".*/\\1/p" "$manifest" | head -n 1)
[[ "$expected_sha" =~ ^[a-f0-9]{64}$ ]] || { echo "错误：备份清单无效。" >&2; exit 1; }
checksum_line=$(cat -- "$checksum_file")
[[ "$checksum_line" =~ ^([a-f0-9]{64})\ \ $backup_name$ ]] || { echo "错误：备份校验文件无效。" >&2; exit 1; }
checksum_sha=${BASH_REMATCH[1]}
actual_sha=$(sha256sum -- "$backup_path" | awk '{ print $1 }')
[ "$actual_sha" = "$checksum_sha" ] && [ "$actual_sha" = "$expected_sha" ] || { echo "错误：备份校验不匹配。" >&2; exit 1; }

compose() {
  docker compose --project-directory "$root_dir" --env-file "$env_file" -f "$root_dir/compose.yaml" "$@"
}

incoming_cleanup_dir=
incoming_root=$(readlink -m -- "$root_dir/backups/incoming")
backup_parent=$(readlink -m -- "$(dirname -- "$backup_path")")
case "$backup_parent" in
  "$incoming_root"/*)
    incoming_name=${backup_parent#"$incoming_root"/}
    if [[ "$incoming_name" =~ ^[a-f0-9]{32}$ ]]; then
      incoming_cleanup_dir=$backup_parent
    fi
    ;;
esac

if [ "$mode" = disaster-recovery ]; then
  if [ -n "$(compose ps -a -q db 2>/dev/null || true)" ] || docker volume inspect campus-sweep_campus_sweep_pgdata >/dev/null 2>&1 || docker volume inspect campus_sweep_pgdata >/dev/null 2>&1; then
    echo "错误：目标服务器已有生产数据库，不是空服务器。" >&2
    exit 1
  fi
  compose up -d db
  until compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do sleep 1; done
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_PASSWORD -in "$backup_path" \
    | compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error
  compose build app provision
  compose run --rm provision
  compose up -d app caddy --no-deps --remove-orphans
  echo "灾难恢复完成；请执行业务验收后再切换流量。"
  exit 0
fi

restore_id=$(openssl rand -hex 16)
[[ "$restore_id" =~ ^[a-f0-9]{32}$ ]] || { echo "错误：无法生成恢复标识。" >&2; exit 1; }
container="campus-sweep-restore-$restore_id"
volume="campus-sweep-restore-$restore_id"
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm -f "$volume" >/dev/null 2>&1 || true
  [ -z "$incoming_cleanup_dir" ] || rm -rf -- "$incoming_cleanup_dir"
}
on_signal() {
  exit 143
}
trap cleanup EXIT
trap on_signal INT TERM

docker volume create "$volume" >/dev/null
docker run -d --name "$container" --label campus-sweep.restore=true -e POSTGRES_DB=restore -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore-only-password -v "$volume:/var/lib/postgresql" postgres:18-alpine >/dev/null
for _ in {1..30}; do
  if docker exec "$container" pg_isready -U restore -d restore >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U restore -d restore >/dev/null 2>&1 || { echo "错误：临时恢复数据库未就绪。" >&2; exit 1; }
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_PASSWORD -in "$backup_path" \
  | docker exec -i "$container" pg_restore -U restore -d restore --exit-on-error --no-owner
checks=$("$root_dir/ops/server/verify-restored-data.sh" "$container" "$manifest")
finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ -z "$report_path" ]; then
  report_dir="${RESTORE_REPORT_DIR:-$root_dir/restore-reports}"
  mkdir -p -- "$report_dir"
  chmod 700 -- "$report_dir"
  report_path="$report_dir/restore-$stem-$restore_id.json"
fi
report_path=$(readlink -m -- "$report_path")
mkdir -p -- "$(dirname -- "$report_path")"
umask 077
printf '{"formatVersion":1,"mode":"verify","backupStem":"%s","startedAt":"%s","finishedAt":"%s","status":"success","checks":%s}\n' \
  "$stem" "$started_at" "$finished_at" "$checks" > "$report_path"
chmod 600 -- "$report_path"
printf '恢复演练成功：%s\n' "$report_path"
