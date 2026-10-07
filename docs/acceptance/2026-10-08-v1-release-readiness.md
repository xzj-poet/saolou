# V1 发布验收追踪（2026-10-08）

本文件逐项追踪冻结产品设计第 16 节的 24 条验收标准。状态含义：

- `covered`：已有实现与自动化证据。
- `partial`：核心能力存在，但缺少验收标准要求的完整浏览器证据。
- `gap`：现有交互或状态与冻结设计不一致。

## 基线矩阵

| # | 状态 | 验收要求（摘要） | 当前证据 / 缺口 |
|---:|---|---|---|
| 1 | partial | 一层 20 间宿舍可在两轮批量操作内完成 | 批量原子写入已有 `sweep-record-service.integration.test.ts` 和 `sweep-core.spec.ts`；尚无 20 间、两轮真实浏览器验收。Task 4 补齐。 |
| 2 | covered | 每个“代理 × 宿舍”最多一条当前记录 | Prisma 复合唯一约束；`tests/integration/schema.test.ts`；`sweep-record-service.integration.test.ts`。 |
| 3 | covered | 已覆盖 > 待补扫 > 未扫 | `src/modules/sweep/sweep-status.test.ts` 与矩阵集成测试。 |
| 4 | covered | 代理不能修改或删除他人记录 | 写入身份取自服务端会话；`sweep-record-routes.integration.test.ts` 与服务集成测试。 |
| 5 | covered | 批量保存全部成功或全部失败 | `rolls back every batch write and audit when one target is stale` 集成测试。 |
| 6 | covered | 创建、修改、管理员删除均有审计 | 代理与管理员服务集成测试；桌面 Playwright 纠错与审计流程。 |
| 7 | gap | 快捷备注默认收起、最多五条并内部滚动 | 当前编辑器直接铺开按钮，虽有滚动高度但不符合默认收起的横幅式下拉交互。Task 2 修正，Task 4 浏览器验收。 |
| 8 | partial | 返回和主要操作点击区至少 48 px | 登录、一个返回按钮和 CSS 基线已有证据；矩阵、批量、编辑器主要操作缺少移动端浏览器全链路测量。Task 4 补齐。 |
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
| 24 | gap | 学校、楼栋、矩阵分别有加载、空、失败重试 | 学校和楼栋已有部分空状态；缺少统一加载/错误重试，无授权学校提示不完整，空矩阵仍显示批量入口。Task 3 修正，Task 4 浏览器验收。 |

## 本轮实施目标

1. 用折叠式快捷备注选择器关闭标准 7 的交互缺口。
2. 用 App Router 加载/错误边界及精确空状态关闭标准 24 的状态缺口。
3. 用真实浏览器覆盖 20 间宿舍两轮批量操作，补全标准 1 的规模验收。
4. 用 Pixel 7 视口测量代理端关键操作，补全标准 8 的移动端验收。

## 发布证据

待 Task 5 在全新、可丢弃的 PostgreSQL 18 与 Docker 环境中运行后填写。任何未获得新鲜命令输出的项目不得从 `partial/gap` 改为 `covered`。
