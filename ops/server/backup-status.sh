#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file="$root_dir/.env.production"
json=0
if [ "${1:-}" = "--json" ] && [ "$#" -eq 1 ]; then
  json=1
elif [ "$#" -ne 0 ]; then
  echo "用法：$0 [--json]" >&2
  exit 2
fi

if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi
# shellcheck disable=SC1091
. "$root_dir/ops/server/backup-lib.sh"

backup_dir=$(resolve_backup_dir "${BACKUP_DIR:-$root_dir/backups}")
restore_report_dir=${RESTORE_REPORT_DIR:-$root_dir/restore-reports}
mapfile -t candidate_stems < <(list_complete_backup_stems "$backup_dir")
valid_stems=()
corrupt_count=0
for stem in "${candidate_stems[@]}"; do
  if (cd "$backup_dir" && sha256sum -c -- "$stem.dump.enc.sha256" >/dev/null 2>&1); then
    valid_stems+=("$stem")
  else
    corrupt_count=$((corrupt_count + 1))
  fi
done

latest_backup=
latest_age_seconds=-1
status=absent
if [ "${#valid_stems[@]}" -gt 0 ]; then
  latest_backup=${valid_stems[${#valid_stems[@]} - 1]}
  latest_epoch=$(backup_stem_epoch "$latest_backup")
  now_epoch=$(date -u +%s)
  latest_age_seconds=$((now_epoch - latest_epoch))
  if [ "$latest_age_seconds" -gt 172800 ]; then
    status=overdue
  else
    status=fresh
  fi
elif [ "$corrupt_count" -gt 0 ]; then
  status=corrupt
fi

available_kib=$(df -Pk "$backup_dir" | awk 'NR == 2 { print $4 }')
free_bytes=$((available_kib * 1024))
timer_state=unavailable
systemctl_command=${SYSTEMCTL_COMMAND:-systemctl}
if command -v "$systemctl_command" >/dev/null 2>&1; then
  if "$systemctl_command" is-enabled --quiet campus-sweep-backup.timer 2>/dev/null; then
    timer_state=enabled
    if "$systemctl_command" is-active --quiet campus-sweep-backup.timer 2>/dev/null; then
      timer_state=active
    fi
  else
    timer_state=disabled
  fi
fi

latest_restore_report=
if [ -d "$restore_report_dir" ]; then
  latest_restore_report=$(find "$restore_report_dir" -maxdepth 1 -type f -name 'restore-*.json' -printf '%f\n' 2>/dev/null | sort | tail -n 1)
fi

if [ "$json" -eq 1 ]; then
  printf '{"status":"%s","latestBackup":"%s","completeSetCount":%d,"corruptSetCount":%d,"latestAgeSeconds":%d,"retentionDays":7,"freeBytes":%d,"timerState":"%s","latestRestoreReport":"%s"}\n' \
    "$status" "$latest_backup" "${#valid_stems[@]}" "$corrupt_count" "$latest_age_seconds" "$free_bytes" "$timer_state" "$latest_restore_report"
else
  printf '备份状态：%s\n最近备份：%s\n有效备份数：%d\n损坏备份数：%d\n剩余空间：%d 字节\n定时器：%s\n最近恢复报告：%s\n' \
    "$status" "${latest_backup:-无}" "${#valid_stems[@]}" "$corrupt_count" "$free_bytes" "$timer_state" "${latest_restore_report:-无}"
fi

[ "$status" = fresh ]
