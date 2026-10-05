#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
template_dir="$root_dir/ops/systemd"
unit_dir=${SYSTEMD_UNIT_DIR:-/etc/systemd/system}
deployment_user=${DEPLOYMENT_USER:-$(id -un)}
systemctl_command=${SYSTEMCTL_COMMAND:-systemctl}

if [[ ! "$deployment_user" =~ ^[a-z_][a-z0-9_-]*\$?$ ]]; then
  echo "错误：部署用户名不符合 systemd 用户格式。" >&2
  exit 1
fi
for value in "$root_dir" "$root_dir/ops/server/backup.sh"; do
  case "$value" in
    (*$'\n'*|*$'\r'*) echo "错误：部署路径包含换行符。" >&2; exit 1 ;;
  esac
done

systemd_quote() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}

service_content=$(<"$template_dir/campus-sweep-backup.service.in")
service_content=${service_content//@DEPLOYMENT_USER@/$deployment_user}
service_content=${service_content//@WORKING_DIRECTORY@/$(systemd_quote "$root_dir")}
service_content=${service_content//@BACKUP_SCRIPT@/$(systemd_quote "$root_dir/ops/server/backup.sh")}

temporary_dir=$(mktemp -d)
trap 'rm -rf -- "$temporary_dir"' EXIT
printf '%s\n' "$service_content" > "$temporary_dir/campus-sweep-backup.service"
cp -- "$template_dir/campus-sweep-backup.timer" "$temporary_dir/campus-sweep-backup.timer"
chmod 644 "$temporary_dir"/*

install_units() {
  mkdir -p -- "$unit_dir"
  install -m 0644 "$temporary_dir/campus-sweep-backup.service" "$unit_dir/campus-sweep-backup.service"
  install -m 0644 "$temporary_dir/campus-sweep-backup.timer" "$unit_dir/campus-sweep-backup.timer"
}

if [ "$unit_dir" = "/etc/systemd/system" ] && [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || {
    echo "错误：安装备份定时器需要 sudo。" >&2
    exit 1
  }
  sudo mkdir -p -- "$unit_dir"
  sudo install -m 0644 "$temporary_dir/campus-sweep-backup.service" "$unit_dir/campus-sweep-backup.service"
  sudo install -m 0644 "$temporary_dir/campus-sweep-backup.timer" "$unit_dir/campus-sweep-backup.timer"
  sudo "$systemctl_command" daemon-reload
  sudo "$systemctl_command" enable --now campus-sweep-backup.timer
else
  install_units
  "$systemctl_command" daemon-reload
  "$systemctl_command" enable --now campus-sweep-backup.timer
fi

echo "每日备份定时器已启用。"
