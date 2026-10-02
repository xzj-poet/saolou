# 开发与运维手册

## 版本要求

- Node.js 24 LTS
- npm（使用仓库中的 `package-lock.json`）
- Docker Engine 与 Docker Compose v2
- Windows 执行原型契约时使用 PowerShell 7（`pwsh`）

## 从干净仓库启动（Windows PowerShell）

```powershell
Copy-Item .env.example .env
docker compose -f compose.dev.yaml up -d db
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run bootstrap:admin
npm run dev
```

首次运行前，把 `.env` 中的 `ADMIN_PASSWORD` 改成至少 10 位的本地密码。浏览器访问 `http://localhost:3000/login`。

## 从干净仓库启动（Linux/macOS）

```sh
cp .env.example .env
docker compose -f compose.dev.yaml up -d db
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run bootstrap:admin
npm run dev
```

## 完整质量检查

数据库启动并完成迁移后运行：

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:deployment
npx playwright install chromium
npm run test:e2e
```

冻结原型回归：

```powershell
node --test tests/*.test.mjs
pwsh -NoProfile -File tests/prototype-contract.ps1
```

## 生产部署与升级

```sh
./deploy.sh
```

该命令会校验生产配置、等待数据库、在已有环境中先生成 `backups/pre-deploy-*.sql.gz`、构建应用、执行 Prisma 向前迁移、幂等创建管理员、启动 Caddy，并等待 `/api/health` 通过。部署脚本不会清空数据卷，也不会覆盖已有管理员密码。

常用诊断：

```sh
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail 100 app
docker compose --env-file .env.production logs --tail 100 caddy
```

本机备份只是升级保护，不替代异机备份。生产环境应每天把备份同步到独立存储，设置保留期，并定期恢复到临时 PostgreSQL 实例核对数据。
