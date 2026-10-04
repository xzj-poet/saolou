# 校园扫楼记录系统

面向单个扫楼团队的在线 Web 系统。当前生产基础已经包含 PostgreSQL 数据模型、共享登录、管理员/代理权限边界、数据库会话、健康检查和容器化部署；业务页面将按照 `docs/superpowers/plans/2026-10-02-campus-sweep-saas-roadmap.md` 继续交付。

## 服务器一键部署

服务器需要 Linux、Git、Docker Engine 和 Docker Compose v2。克隆仓库后执行：

```sh
./deploy.sh
```

首次运行会自动生成仅当前用户可读的 `.env.production`、数据库所有者密码、独立的应用运行密码和管理员初始密码，随后构建固定依赖、启动 PostgreSQL、执行迁移、创建最小权限运行账号、验证其只能读写业务数据而不能建表、创建唯一管理员、启动应用与 Caddy，并等待健康检查通过。再次运行会复用数据卷，在迁移前自动生成本机备份，然后幂等升级；旧版单账号配置也会自动补齐独立运行账号。

默认监听 HTTP 80。要启用自动 HTTPS，把 `.env.production` 中的 `SITE_ADDRESS=:80` 改为已解析到服务器的域名（例如 `sweep.example.com`），再执行一次 `./deploy.sh`。

> `.env.production` 和 `backups/` 不进入 Git。生产环境还应把每日备份同步到异机存储，并定期实际恢复验证。

## 本地开发

完整的 Windows PowerShell 和 Linux/macOS 操作步骤、测试命令与常见维护操作见 [开发与运维手册](docs/development.md)。

核心命令：

```sh
npm ci
npm run db:generate
npm run dev
```

## 项目结构

- `src/app`：页面、Route Handler 与健康检查
- `src/modules`：按业务领域组织的服务
- `prisma`：数据模型与向前迁移
- `e2e`：桌面端与移动端浏览器流程
- `compose.yaml`、`deploy.sh`：生产部署入口
- `docs/prototype`：已确认的交互原型，仅作为视觉与流程依据
