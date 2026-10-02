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
  admin_password=$(random_secret)
  umask 077
  printf '%s\n' \
    'POSTGRES_DB=campus_sweep' \
    'POSTGRES_USER=campus_sweep' \
    "POSTGRES_PASSWORD=$postgres_password" \
    "DATABASE_URL=postgresql://campus_sweep:$postgres_password@db:5432/campus_sweep?schema=public" \
    'ADMIN_USERNAME=admin' \
    "ADMIN_PASSWORD=$admin_password" \
    'SITE_ADDRESS=:80' > "$env_file"
  generated_env=1
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
  mkdir -p "$root_dir/backups"
  backup_file="$root_dir/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -c' > "$backup_file"
  echo "部署前数据库备份：$backup_file"
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

echo "部署完成。访问地址由 .env.production 中的 SITE_ADDRESS 决定。"
if [ "$generated_env" -eq 1 ]; then
  echo "首次管理员账号：admin"
  echo "首次管理员密码：$admin_password"
  echo "请立即保存密码，并按需配置域名后重新运行 ./deploy.sh。"
fi
