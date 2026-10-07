# V1 发布验收追踪（2026-10-08）

本文件逐项追踪冻结产品设计第 16 节的 24 条验收标准。状态含义：

- `covered`：已有实现与自动化证据。
- `partial`：核心能力存在，但缺少验收标准要求的完整浏览器证据。
- `gap`：现有交互或状态与冻结设计不一致。

## 基线矩阵

| # | 状态 | 验收要求（摘要） | 当前证据 / 缺口 |
|---:|---|---|---|
| 1 | covered | 一层 20 间宿舍可在两轮批量操作内完成 | 2026-10-08 `e2e/release-readiness.spec.ts`：真实浏览器中 20 间宿舍分两轮各 10 间保存，页面显示 20 已覆盖，数据库轮询确认 20 条 COVERED 记录。 |
| 2 | covered | 每个“代理 × 宿舍”最多一条当前记录 | Prisma 复合唯一约束；`tests/integration/schema.test.ts`；`sweep-record-service.integration.test.ts`。 |
| 3 | covered | 已覆盖 > 待补扫 > 未扫 | `src/modules/sweep/sweep-status.test.ts` 与矩阵集成测试。 |
| 4 | covered | 代理不能修改或删除他人记录 | 写入身份取自服务端会话；`sweep-record-routes.integration.test.ts` 与服务集成测试。 |
| 5 | covered | 批量保存全部成功或全部失败 | `rolls back every batch write and audit when one target is stale` 集成测试。 |
| 6 | covered | 创建、修改、管理员删除均有审计 | 代理与管理员服务集成测试；桌面 Playwright 纠错与审计流程。 |
| 7 | covered | 快捷备注默认收起、最多五条并内部滚动 | `QuickNotePicker` 默认收起；定向组件测试覆盖选择与关闭；2026-10-08 浏览器验收确认展开列表内部滚动、最后一项为自定义备注。 |
| 8 | covered | 返回和主要操作点击区至少 48 px | 2026-10-08 Pixel 7 浏览器验收逐项测量学校、楼栋、矩阵房间、返回、批量、状态、备注选择和保存控件，均不少于 48 px。 |
| 9 | covered | 历史只展示各代理最新状态 | `sweep-detail-service.integration.test.ts` 与 `sweep-core.spec.ts`。 |
| 10 | covered | 不包含销售、客户、订单、佣金和经营报表 | 路由与模块清单无相关功能；管理员导航仅基础数据、代理、快捷备注、扫楼数据。 |
| 11 | covered | 无本人记录进入编辑器，有记录进入详情 | `building-matrix.test.tsx` 与桌面 Playwright 单条流程。 |
| 12 | covered | 新增、编辑、批量共用记录编辑器 | 三条页面路径均使用 `RecordEditor`；组件测试覆盖 create/edit/batch。 |
| 13 | covered | 返回恢复上级、楼层和未提交选择 | URL 保留 `floor`；`BatchSelector` 使用会话级选择；未保存导航保护与组件测试。 |
| 14 | covered | 学校授权状态可见，未授权不可进入且服务端拒绝 | 学校列表组件、服务集成测试及 `campus-agent-access.spec.ts`。 |
| 15 | covered | 保存后返回原矩阵并刷新状态 | `record-editor.test.tsx` 的 800ms 返回行为与 `sweep-core.spec.ts`。 |
| 16 | covered | 批量页展示具体宿舍号 | `batch-selection.test.ts`、`building-matrix.test.tsx` 与 Playwright。 |
| 17 | covered | 本人记录显示星号且不改变整体颜色 | `building-matrix.test.tsx` 与桌面 Playwright。 |
| 18 | covered | 学校后先进入独立楼栋选择页 | `building-list.test.tsx` 与 `campus-agent-access.spec.ts`。 |
| 19 | covered | 管理端学校收纳栏、楼栋卡片、统一宿舍管理 | `campus-manager.test.tsx` 与校园管理 Playwright。 |
| 20 | covered | 空基础数据可删除，有关联只能停用 | 校园服务集成测试与校园管理 Playwright 的混合删除/停用验证。 |
| 21 | covered | 楼层和宿舍数只由有效宿舍派生 | 校园读服务集成测试与“备注 99 层但显示 1 层 2 间”浏览器验收。 |
| 22 | covered | 展示姓名身份，退出唯一；脏表单先确认 | 身份菜单、未保存变更组件测试及认证 Playwright。 |
| 23 | covered | 会话失效回登录，权限取消回学校选择 | 受保护布局集成测试、认证与校园访问 Playwright。 |
| 24 | covered | 学校、楼栋、矩阵分别有加载、空、失败重试 | 新增 `/app` 段加载态和可重新加载的错误边界；无授权学校与空楼栋状态具备明确提示且空矩阵不再提供批量入口。定向 8/8 与完整单元 84/84 通过。 |

## 本轮实施目标

1. 用折叠式快捷备注选择器关闭标准 7 的交互缺口。
2. 用 App Router 加载/错误边界及精确空状态关闭标准 24 的状态缺口。
3. 用真实浏览器覆盖 20 间宿舍两轮批量操作，补全标准 1 的规模验收。
4. 用 Pixel 7 视口测量代理端关键操作，补全标准 8 的移动端验收。

## 发布证据

执行日期：2026-10-08。所有命令基于提交 `0281696`（随后只提交本证据文档），使用独立的 PostgreSQL 18 容器和临时 Linux 工作副本；未使用既有 `saolou` 或备份演练容器的数据。

| 检查 | 新鲜结果 |
|---|---|
| 数据库 | 迁移、运行时账号创建与最小权限验证均通过；`test:integration` 24 文件、86 测试全部通过。 |
| 应用质量 | Prisma Client 生成、ESLint、Next 类型检查、生产构建均通过；单元测试 27 文件、84 测试全部通过。 |
| 浏览器 | 全套 Playwright：13 通过；3 项为桌面/移动项目的明确筛选，并非环境跳过。发布专用桌面与 Pixel 7 用例均独立通过。 |
| 部署与恢复 | Linux `test:deployment` 40/40 通过、0 跳过；独立的真实 PostgreSQL 18 备份—隔离恢复 9/9 通过、0 跳过。 |
| Windows 客户端 | `test:backup:windows` 通过：备份 23 项断言、恢复 14 项断言。 |
| 生产容器 | `docker compose config --quiet` 通过；提交 `0281696` 的 app 镜像构建成功，在独立数据库上启动后 `GET /api/health` 返回 `{"status":"ok"}`。 |

残余说明：npm 报告 9 个高风险依赖漏洞，现有锁文件未作升级；`npm audit fix --force` 会引入破坏性大版本变更，因此不作为本次发布就绪修复的一部分。该问题不影响上述功能、部署或恢复验收，但应另立依赖升级任务处理。
