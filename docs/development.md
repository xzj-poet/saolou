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

## 学校、楼栋、宿舍与代理授权验收

1. 使用管理员账号进入“基础数据”，添加一所测试学校，并从学校右侧菜单新建楼栋。
2. 从楼栋右侧菜单进入“宿舍管理”，使用“批量添加”建立 `201`、`202`。返回列表后应显示 `1层 · 2间宿舍`；统计只来自已启用宿舍，不读取楼栋备注中的数字。
3. 点击楼栋卡片可查看按楼层分组的宿舍蓝图；楼栋右侧三点菜单只承载编辑、宿舍管理和删除/停用操作。
4. 进入“代理账号”，创建临时代理并立即保存一次性密码。通过代理右侧菜单授权刚创建的学校。
5. 在新的无痕窗口用代理账号登录：先选择学校，再选择楼栋，最后查看宿舍目录。代理端返回按钮应为淡灰色大按钮。
6. 管理员取消该代理的学校权限后，代理再次访问原楼栋地址，应自动返回学校选择页并提示权限已取消。
7. 在宿舍管理中同时处理有扫楼记录和无记录的宿舍：有记录的宿舍只停用，无记录的宿舍永久删除，历史扫楼记录与其中保存的备注文本保持不变。

浏览器自动验收使用隔离的随机测试数据，不记录或输出真实账号密码：

```sh
npm run test:e2e -- e2e/campus-agent-access.spec.ts
```

本项目固定使用 Node.js 24。若机器上存在多个 Node.js 版本，请先确认 `node -v` 显示 `v24.x`，再启动 Prisma 本地数据库和执行测试。

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
