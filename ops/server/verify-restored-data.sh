#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$#" -ne 2 ]; then
  echo "用法：$0 <restore-container> <manifest.json>" >&2
  exit 2
fi

container=$1
manifest=$2
if [[ ! "$container" =~ ^campus-sweep-restore-[a-f0-9]{32}$ ]] || [ ! -f "$manifest" ]; then
  echo "错误：恢复校验目标无效。" >&2
  exit 1
fi

manifest_number() {
  local key=$1 value
  value=$(sed -nE "s/^[[:space:]]*\"${key}\"[[:space:]]*:[[:space:]]*([0-9]+).*/\\1/p" "$manifest" | head -n 1)
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

expected_migrations=$(manifest_number migrationCount)
expected_user=$(manifest_number User)
expected_school=$(manifest_number School)
expected_building=$(manifest_number Building)
expected_dormitory=$(manifest_number Dormitory)
expected_record=$(manifest_number SweepRecord)
expected_audit=$(manifest_number SweepAudit)
expected_session=$(manifest_number Session)

mapfile -t actual < <(docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U restore -d restore <<'SQL'
SELECT count(*) FROM "_prisma_migrations";
SELECT count(*) FROM "User";
SELECT count(*) FROM "School";
SELECT count(*) FROM "Building";
SELECT count(*) FROM "Dormitory";
SELECT count(*) FROM "SweepRecord";
SELECT count(*) FROM "SweepAudit";
SELECT count(*) FROM "Session";
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('_prisma_migrations', 'User', 'School', 'Building', 'Dormitory', 'SweepRecord', 'SweepAudit', 'Session');
SELECT count(*) FROM (SELECT "agentId", "dormitoryId" FROM "SweepRecord" GROUP BY "agentId", "dormitoryId" HAVING count(*) > 1) AS duplicates;
SELECT count(*) FROM "SweepRecord" AS record LEFT JOIN "User" AS agent ON agent.id = record."agentId" LEFT JOIN "Dormitory" AS dormitory ON dormitory.id = record."dormitoryId" WHERE agent.id IS NULL OR dormitory.id IS NULL;
SQL
)

[ "${#actual[@]}" -eq 11 ] || {
  echo "错误：恢复数据库返回了不完整的校验结果。" >&2
  exit 1
}
for value in "${actual[@]}"; do
  [[ "$value" =~ ^[0-9]+$ ]] || {
    echo "错误：恢复数据库返回了无效的校验结果。" >&2
    exit 1
  }
done

expected=($expected_migrations $expected_user $expected_school $expected_building $expected_dormitory $expected_record $expected_audit $expected_session)
for index in {0..7}; do
  [ "${actual[$index]}" = "${expected[$index]}" ] || {
    echo "错误：恢复数据计数与备份清单不一致。" >&2
    exit 1
  }
done
[ "${actual[8]}" -ge 8 ] || { echo "错误：恢复缺少关键表。" >&2; exit 1; }
[ "${actual[9]}" = 0 ] || { echo "错误：恢复后的扫楼记录唯一性异常。" >&2; exit 1; }
[ "${actual[10]}" = 0 ] || { echo "错误：恢复后的扫楼记录引用异常。" >&2; exit 1; }

printf '["schema","migrationCount","rowCounts","sweepRecordUniqueness","references"]\n'
