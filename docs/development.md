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

## 扫楼核心流程冒烟验收

1. 管理员进入“快捷备注”，分别在“待补扫”和“已覆盖”分组新增备注，确认可编辑、停用、排序和删除；这些配置变化不应改写已保存的记录或审计文本。
2. 代理选择已授权学校和楼栋。楼栋矩阵应显示灰色未扫、黄色待补扫、绿色已覆盖三态、顶部数量，以及本人记录上的星号。
3. 点击没有本人记录的宿舍应进入新增页；保存待补扫或已覆盖后返回原楼层。点击有本人记录的宿舍应进入详情页，详情只显示本人记录。
4. 在楼栋矩阵进入“批量标记”，先选择具体宿舍，再统一设置状态和备注。保存成功后回到原楼层；失败时选择和输入应保留。
5. 从宿舍详情进入“最新记录”，确认每位代理只显示一条当前结果，按更新时间倒序排列。
6. 管理员进入“扫楼数据”，组合使用学校、楼栋、房号、代理和状态筛选；修改或二次确认删除当前记录后，在“审计记录”页签核对操作人及前后快照。
7. 取消代理学校授权后，代理重新打开旧的楼栋或录入地址，应返回学校选择页并显示权限已取消。

扫楼核心浏览器验收使用独立随机数据：

```sh
npm run test:e2e -- e2e/sweep-core.spec.ts
```

本地执行数据库驱动的完整套件时，优先使用 `compose.dev.yaml` 中的 PostgreSQL；若使用 `prisma dev`，请在长时间测试前通过 `npx prisma dev ls` 确认服务状态为 `running`。

本项目固定使用 Node.js 24。若机器上存在多个 Node.js 版本，请先确认 `node -v` 显示 `v24.x`，再启动 Prisma 本地数据库和执行测试。

## 依赖审计基线（2026-10-04）

执行了 `npm audit --json` 和 `npm audit --omit=dev --json`，未使用 `npm audit fix --force`。当前报告为 0 个 critical、9 个 high；其中直接依赖项为 `prisma` 和 `eslint-config-next`。

- `eslint-config-next` 链路中的 `fast-glob` / `micromatch` / `braces` 只在代码检查阶段处理仓库内固定模式，不进入生产服务。审计建议降级到 Next 14 的配置包，属于不兼容的大版本变化，因此本阶段不采用；等待 Next 16 兼容修复后再升级。
- `prisma` 7.10.0 的报告来自 CLI/config 链路中的 `deepmerge-ts`，以及未被本项目使用的 MySQL 驱动 `mysql2`。生产应用使用 PostgreSQL `@prisma/adapter-pg`，不连接 MySQL，也不接收外部 Prisma 配置对象。审计建议降级到 Prisma 6.19.3，属于不兼容的大版本变化；保留当前锁定版本，待 Prisma 7 的兼容补丁发布后升级并重新运行完整迁移、集成和部署测试。

这些是已记录、暂时接受的构建/未使用驱动暴露，不代表可以忽略后续升级。每次依赖升级和正式部署前都应重新执行审计。

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
