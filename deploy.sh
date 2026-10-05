#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$root_dir/.env.production"
generated_env=0

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：服务器尚未安装 Docker。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "错误：需要 Docker Compose v2。" >&2
  exit 1
fi

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

if [ ! -f "$env_file" ]; then
  postgres_password=$(random_secret)
  app_password=$(random_secret)
  admin_password=$(random_secret)
  backup_password=$(random_secret)
  umask 077
  printf '%s\n' \
    'POSTGRES_DB=campus_sweep' \
    'POSTGRES_USER=campus_sweep' \
    "POSTGRES_PASSWORD=$postgres_password" \
    'POSTGRES_APP_USER=campus_sweep_app' \
    "POSTGRES_APP_PASSWORD=$app_password" \
    "DATABASE_ADMIN_URL=postgresql://campus_sweep:$postgres_password@db:5432/campus_sweep?schema=public" \
    "DATABASE_URL=postgresql://campus_sweep_app:$app_password@db:5432/campus_sweep?schema=public" \
    'ADMIN_USERNAME=admin' \
    "ADMIN_PASSWORD=$admin_password" \
    "BACKUP_ENCRYPTION_PASSWORD=$backup_password" \
    'SITE_ADDRESS=:80' > "$env_file"
  generated_env=1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

deployment_commit=$(git -C "$root_dir" rev-parse --verify HEAD 2>/dev/null || printf '%s' unknown)
APP_GIT_COMMIT=$deployment_commit
export APP_GIT_COMMIT

if [ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]; then
  backup_password=$(random_secret)
  temporary_env=$(mktemp "$root_dir/.env.production.XXXXXX")
  grep -Ev '^BACKUP_ENCRYPTION_PASSWORD=' "$env_file" > "$temporary_env"
  printf 'BACKUP_ENCRYPTION_PASSWORD=%s\n' "$backup_password" >> "$temporary_env"
  chmod 600 "$temporary_env"
  mv "$temporary_env" "$env_file"
  BACKUP_ENCRYPTION_PASSWORD=$backup_password
  export BACKUP_ENCRYPTION_PASSWORD
fi
chmod 600 "$env_file"

if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  app_password=$(random_secret)
  database_admin_url=${DATABASE_ADMIN_URL:-${DATABASE_URL:?DATABASE_URL is required for upgrade}}
  temporary_env=$(mktemp "$root_dir/.env.production.XXXXXX")
  grep -Ev '^(POSTGRES_APP_USER|POSTGRES_APP_PASSWORD|DATABASE_ADMIN_URL|DATABASE_URL)=' "$env_file" > "$temporary_env"
  printf '%s\n' \
    'POSTGRES_APP_USER=campus_sweep_app' \
    "POSTGRES_APP_PASSWORD=$app_password" \
    "DATABASE_ADMIN_URL=$database_admin_url" \
    "DATABASE_URL=postgresql://campus_sweep_app:$app_password@db:5432/${POSTGRES_DB}?schema=public" >> "$temporary_env"
  chmod 600 "$temporary_env"
  mv "$temporary_env" "$env_file"
fi

compose() {
  docker compose --project-directory "$root_dir" --env-file "$env_file" -f "$root_dir/compose.yaml" "$@"
}

compose config --quiet
existing_db=$(compose ps -a -q db 2>/dev/null || true)
compose up -d db

attempt=0
until compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "错误：数据库未能在预期时间内就绪。" >&2
    exit 1
  fi
  sleep 2
done

if [ -n "$existing_db" ]; then
  "$root_dir/ops/server/backup.sh" --reason pre-deploy
fi

compose build app provision
compose run --rm provision
compose up -d app caddy --no-deps --remove-orphans

app_container=$(compose ps -q app)
attempt=0
while [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$app_container")" != "healthy" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    compose logs --tail 100 app
    echo "错误：应用健康检查未通过。" >&2
    exit 1
  fi
  sleep 2
done

"$root_dir/ops/server/install-backup-timer.sh"

echo "部署完成。访问地址由 .env.production 中的 SITE_ADDRESS 决定。"
if [ "$generated_env" -eq 1 ]; then
  echo "首次管理员账号：admin"
  echo "首次管理员密码：$admin_password"
  echo "请立即保存密码，并按需配置域名后重新运行 ./deploy.sh。"
fi
