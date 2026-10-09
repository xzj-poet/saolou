#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$root_dir/.env.production"
base_url=
expected_commit=
phase=

usage() {
  echo "用法：$0 --base-url <https-url> --expected-commit <40位Git提交> --phase <first|repeat>" >&2
  exit 2
}

fail() {
  echo "验收失败：$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url) [ "$#" -ge 2 ] || usage; base_url=${2%/}; shift 2 ;;
    --expected-commit) [ "$#" -ge 2 ] || usage; expected_commit=$2; shift 2 ;;
    --phase) [ "$#" -ge 2 ] || usage; phase=$2; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$base_url" =~ ^https://[^[:space:]]+$ ]] || fail "base URL 必须是 HTTPS 地址。"
[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]] || fail "expected commit 必须是 40 位小写 SHA。"
[[ "$phase" =~ ^(first|repeat)$ ]] || fail "phase 只能是 first 或 repeat。"
[ -f "$env_file" ] || fail "缺少 .env.production；请先运行 ./deploy.sh。"
command -v docker >/dev/null 2>&1 || fail "需要 Docker。"
command -v curl >/dev/null 2>&1 || fail "需要 curl。"

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

compose() {
  docker compose --project-directory "$root_dir" --env-file "$env_file" -f "$root_dir/compose.yaml" "$@"
}

actual_commit=$(git -C "$root_dir" rev-parse --verify HEAD 2>/dev/null) || fail "当前目录不是可验证的 Git 提交。"
[ "$actual_commit" = "$expected_commit" ] || fail "当前 Git 提交与 expected commit 不一致。"

for service in db app caddy; do
  container=$(compose ps -q "$service")
  [ -n "$container" ] || fail "服务 $service 未创建。"
  state=$(docker inspect --format '{{.State.Status}}' "$container")
  [ "$state" = running ] || fail "服务 $service 未运行。"
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")
  if [ "$service" = db ] || [ "$service" = app ]; then
    [ "$health" = healthy ] || fail "服务 $service 健康检查未通过。"
  fi
done

app_container=$(compose ps -q app)
image_commit=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$app_container")
[ "$image_commit" = "$expected_commit" ] || fail "运行中的应用镜像提交标签不匹配。"

headers=$(mktemp)
trap 'rm -f -- "$headers"' EXIT
curl --fail --silent --show-error --max-time 20 --dump-header "$headers" --output /dev/null "$base_url/api/health" || fail "HTTPS 健康检查失败。"
grep -Eiq '^Strict-Transport-Security:[[:space:]]*max-age=' "$headers" || fail "HTTPS 响应缺少 HSTS。"

volume_identity=$(docker volume inspect --format '{{.Mountpoint}}' campus-sweep_campus_sweep_pgdata 2>/dev/null) || fail "找不到生产数据库卷。"
[ -n "$volume_identity" ] || fail "生产数据库卷没有可验证身份。"

counts=$(compose exec -T db psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
SELECT 'migrationCount=' || count(*) FROM "_prisma_migrations";
SELECT 'User=' || count(*) FROM "users";
SELECT 'School=' || count(*) FROM "schools";
SELECT 'Building=' || count(*) FROM "buildings";
SELECT 'Dormitory=' || count(*) FROM "dormitories";
SELECT 'SweepRecord=' || count(*) FROM "sweep_records";
SELECT 'SweepAudit=' || count(*) FROM "sweep_audits";
SELECT 'Session=' || count(*) FROM "sessions";
SQL
)

count_value() {
  local key=$1 value
  value=$(printf '%s\n' "$counts" | sed -n "s/^${key}=\([0-9][0-9]*\)$/\1/p" | head -n 1)
  [[ "$value" =~ ^[0-9]+$ ]] || fail "无法读取表 $key 的计数。"
  printf '%s\n' "$value"
}

migration_count=$(count_value migrationCount)
user_count=$(count_value User)
school_count=$(count_value School)
building_count=$(count_value Building)
dormitory_count=$(count_value Dormitory)
sweep_record_count=$(count_value SweepRecord)
sweep_audit_count=$(count_value SweepAudit)
session_count=$(count_value Session)

backup_status=$("$root_dir/ops/server/backup-status.sh" --json) || fail "备份状态不是 fresh。"
latest_restore_report=$(printf '%s' "$backup_status" | sed -n 's/.*"latestRestoreReport":"\([^"]*\)".*/\1/p')
[ -n "$latest_restore_report" ] || fail "没有最近的恢复演练报告。"
restore_report_dir=${RESTORE_REPORT_DIR:-$root_dir/restore-reports}
restore_report="$restore_report_dir/$latest_restore_report"
[ -f "$restore_report" ] || fail "最近的恢复演练报告不存在。"
grep -q '"status":"success"' "$restore_report" || fail "最近的恢复演练报告不是成功状态。"
finished_at=$(sed -n 's/.*"finishedAt":"\([^"]*\)".*/\1/p' "$restore_report" | head -n 1)
finished_epoch=$(date -u -d "$finished_at" +%s 2>/dev/null) || fail "恢复演练报告时间无效。"
now_epoch=$(date -u +%s)
restore_age=$((now_epoch - finished_epoch))
[ "$restore_age" -ge 0 ] && [ "$restore_age" -le $((35 * 86400)) ] || fail "最近恢复演练超过 35 天或时间无效。"

first_evidence="$root_dir/acceptance-evidence/first.json"
if [ "$phase" = repeat ]; then
  [ -f "$first_evidence" ] || fail "重复部署验收需要先保留 first 阶段证据。"
  first_volume=$(sed -n 's/.*"volumeIdentity":"\([^"]*\)".*/\1/p' "$first_evidence")
  [ "$volume_identity" = "$first_volume" ] || fail "重复部署改变了生产数据库卷身份。"
  for key in migrationCount User School Building Dormitory SweepRecord SweepAudit Session; do
    previous=$(sed -n "s/.*\"${key}\":\([0-9][0-9]*\).*/\1/p" "$first_evidence" | head -n 1)
    current=$(count_value "$key")
    [[ "$previous" =~ ^[0-9]+$ ]] || fail "first 阶段证据中的 $key 无效。"
    [ "$current" -ge "$previous" ] || fail "重复部署后 $key 行数减少。"
  done
fi

evidence_dir="$root_dir/acceptance-evidence"
mkdir -p -- "$evidence_dir"
umask 077
evidence_path="$evidence_dir/$phase.json"
printf '{"formatVersion":1,"phase":"%s","checkedCommit":"%s","imageCommit":"%s","volumeIdentity":"%s","migrationCount":%s,"User":%s,"School":%s,"Building":%s,"Dormitory":%s,"SweepRecord":%s,"SweepAudit":%s,"Session":%s,"backupStatus":"fresh","restoreReportStatus":"success"}\n' \
  "$phase" "$actual_commit" "$image_commit" "$volume_identity" "$migration_count" "$user_count" "$school_count" "$building_count" "$dormitory_count" "$sweep_record_count" "$sweep_audit_count" "$session_count" > "$evidence_path"
chmod 600 -- "$evidence_path"
printf '验收通过：%s\n' "$evidence_path"
