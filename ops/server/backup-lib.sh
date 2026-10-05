#!/usr/bin/env bash

backup_error() {
  printf '错误：%s\n' "$*" >&2
}
require_backup_environment() {
  local name
  for name in POSTGRES_DB POSTGRES_USER BACKUP_ENCRYPTION_PASSWORD; do
    if [ -z "${!name:-}" ]; then
      backup_error "缺少备份配置 $name。"
      return 1
    fi
  done
  case "$POSTGRES_DB:$POSTGRES_USER" in
    (*[!A-Za-z0-9_:.-]*) backup_error "数据库名称或用户名称包含不支持的字符。"; return 1 ;;
  esac
}
validate_backup_stem() {
  local stem=${1:-} timestamp normalized
  if [[ ! "$stem" =~ ^campus-sweep-([0-9]{8}T[0-9]{6}Z)$ ]]; then
    backup_error "备份名称无效。"
    return 1
  fi
  timestamp=${BASH_REMATCH[1]}
  normalized=$(date -u -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2} UTC" +%Y%m%dT%H%M%SZ 2>/dev/null) || {
    backup_error "备份时间无效。"
    return 1
  }
  if [ "$normalized" != "$timestamp" ]; then
    backup_error "备份时间无效。"
    return 1
  fi
}

resolve_backup_dir() {
  local directory=$1
  mkdir -p -- "$directory"
  chmod 700 -- "$directory"
  readlink -f -- "$directory"
}

backup_path_is_inside() {
  local directory file parent
  directory=$(readlink -f -- "$1") || return 1
  file=$2
  parent=$(readlink -f -- "$(dirname -- "$file")") || return 1
  [ "$parent" = "$directory" ]
}

list_complete_backup_stems() {
  local directory manifest stem
  directory=$(readlink -f -- "$1") || return 1
  for manifest in "$directory"/campus-sweep-*.manifest.json; do
    [ -f "$manifest" ] || continue
    stem=$(basename -- "$manifest" .manifest.json)
    validate_backup_stem "$stem" >/dev/null 2>&1 || continue
    [ -f "$directory/$stem.dump.enc" ] || continue
    [ -f "$directory/$stem.dump.enc.sha256" ] || continue
    printf '%s\n' "$stem"
  done | sort
}

publish_backup_set() {
  local directory stem temporary_dump temporary_manifest temporary_checksum
  directory=$(readlink -f -- "$1") || return 1
  stem=$2
  temporary_dump=$3
  temporary_manifest=$4
  temporary_checksum=$5
  validate_backup_stem "$stem" || return 1
  backup_path_is_inside "$directory" "$temporary_dump" || return 1
  backup_path_is_inside "$directory" "$temporary_manifest" || return 1
  backup_path_is_inside "$directory" "$temporary_checksum" || return 1
  [ -f "$temporary_dump" ] && [ -f "$temporary_manifest" ] && [ -f "$temporary_checksum" ] || {
    backup_error "备份集合不完整，拒绝发布。"
    return 1
  }
  [ ! -e "$directory/$stem.dump.enc" ] || return 1
  [ ! -e "$directory/$stem.dump.enc.sha256" ] || return 1
  [ ! -e "$directory/$stem.manifest.json" ] || return 1
  chmod 600 -- "$temporary_dump" "$temporary_manifest" "$temporary_checksum"
  mv -- "$temporary_dump" "$directory/$stem.dump.enc"
  mv -- "$temporary_checksum" "$directory/$stem.dump.enc.sha256"
  mv -- "$temporary_manifest" "$directory/$stem.manifest.json"
}

backup_stem_epoch() {
  local stem=$1 timestamp
  validate_backup_stem "$stem" >/dev/null 2>&1 || return 1
  timestamp=${stem#campus-sweep-}
  date -u -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2} UTC" +%s
}

prune_backup_sets() {
  local directory now_epoch retention_days cutoff stem stem_epoch index
  local -a stems=()
  directory=$(readlink -f -- "$1") || return 1
  now_epoch=$2
  retention_days=$3
  [[ "$now_epoch" =~ ^[0-9]+$ && "$retention_days" =~ ^[0-9]+$ ]] || return 1
  mapfile -t stems < <(list_complete_backup_stems "$directory")
  [ "${#stems[@]}" -gt 1 ] || return 0
  cutoff=$((now_epoch - retention_days * 86400))
  for ((index = 0; index < ${#stems[@]} - 1; index++)); do
    stem=${stems[$index]}
    stem_epoch=$(backup_stem_epoch "$stem") || continue
    if [ "$stem_epoch" -lt "$cutoff" ]; then
      rm -- "$directory/$stem.dump.enc" "$directory/$stem.dump.enc.sha256" "$directory/$stem.manifest.json"
    fi
  done
}

require_backup_space() {
  local database_bytes=$1 available_bytes=$2 minimum=$((512 * 1024 * 1024)) doubled
  [[ "$database_bytes" =~ ^[0-9]+$ && "$available_bytes" =~ ^[0-9]+$ ]] || return 1
  doubled=$((database_bytes * 2))
  if [ "$doubled" -gt "$minimum" ]; then
    minimum=$doubled
  fi
  if [ "$available_bytes" -lt "$minimum" ]; then
    backup_error "备份空间不足：至少需要 $minimum 字节。"
    return 1
  fi
}

open_backup_snapshot() {
  coproc CAMPUS_SWEEP_SNAPSHOT {
    compose exec -T db psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
SELECT pg_database_size(current_database());
SELECT count(*) FROM "_prisma_migrations";
SELECT count(*) FROM "User";
SELECT count(*) FROM "School";
SELECT count(*) FROM "Building";
SELECT count(*) FROM "Dormitory";
SELECT count(*) FROM "SweepRecord";
SELECT count(*) FROM "SweepAudit";
SELECT count(*) FROM "Session";
SELECT pg_sleep(86400);
SQL
  }
  BACKUP_SNAPSHOT_PID=$CAMPUS_SWEEP_SNAPSHOT_PID
  BACKUP_SNAPSHOT_FD=${CAMPUS_SWEEP_SNAPSHOT[0]}
  IFS= read -r BACKUP_SNAPSHOT_ID <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_DATABASE_BYTES <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_MIGRATION_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_USER_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_SCHOOL_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_BUILDING_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_DORMITORY_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_SWEEP_RECORD_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_SWEEP_AUDIT_COUNT <&"$BACKUP_SNAPSHOT_FD"
  IFS= read -r BACKUP_SESSION_COUNT <&"$BACKUP_SNAPSHOT_FD"
  [[ "$BACKUP_SNAPSHOT_ID" =~ ^[0-9]+-[0-9]+-[0-9]+$ ]] || {
    backup_error "无法取得数据库一致性快照。"
    return 1
  }
}

close_backup_snapshot() {
  if [ -n "${BACKUP_SNAPSHOT_PID:-}" ]; then
    kill "$BACKUP_SNAPSHOT_PID" 2>/dev/null || true
    wait "$BACKUP_SNAPSHOT_PID" 2>/dev/null || true
    BACKUP_SNAPSHOT_PID=
  fi
}

