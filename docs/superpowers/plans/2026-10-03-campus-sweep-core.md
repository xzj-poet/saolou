# 校园扫楼真实核心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在现有学校、楼栋、宿舍与代理授权基础上，完整接通快捷备注、唯一当前扫楼记录、不可变审计、宿舍整体状态、代理主流程和管理员纠错流程。

**架构：** 保持 Next.js 模块化单体，将扫楼领域集中在 `src/modules/sweep`，快捷备注集中在 `src/modules/quick-notes`。所有身份、权限、唯一性、无语义变化判定和审计写入都在服务端执行；单条与批量写入统一调用同一个事务内 upsert 核心，页面只消费稳定 DTO，不复制业务规则。

**技术栈：** Node.js 24、Next.js 16.3.8 App Router、React 19.2、TypeScript 5.9、Prisma 7、PostgreSQL 18、Zod 4、Vitest、Testing Library、Playwright。

**规格：** `docs/superpowers/specs/2026-09-29-campus-sweep-saas-design.md`

## 全局约束

- 只服务单团队并在线使用；不增加多租户、离线队列、销售数据、金额、联系方式、订单、佣金或经营报表。
- 当前记录只保存 `PENDING` 或 `COVERED`；“未扫”由没有有效当前记录派生，不落库。
- 数据库复合唯一约束 `(agent_id, dormitory_id)` 是最终唯一性边界；代理写接口中的 `agentId` 只能来自会话。
- 代理每个读写接口都沿 `宿舍 → 楼栋 → 学校` 校验学校启用状态、楼栋/宿舍启用状态和当前授权。
- 新建、实际修改、管理员删除当前记录与对应 `SweepAudit` 必须在同一事务中提交；无语义变化不更新时间、不新增审计。
- 快捷备注只是输入辅助；写请求在 `quickNoteId` 与 `customNote` 中二选一或都不传，服务端解析启用且状态匹配的快捷备注并把文字快照写入记录与审计。以后编辑、停用或删除配置不得改变旧文本。
- 备注永远可空，统一限制为 60 个字符；批量宿舍 ID 去重并限制最多 100 间。
- 整体状态只实时派生：任意 `COVERED` > 任意 `PENDING` > 无记录时 `UNVISITED`。
- 单独新增、编辑和批量标记使用同一个记录编辑器组件；保存成功默认返回原楼层矩阵。
- 移动端返回按钮和主要操作点击区至少 48px，状态同时使用颜色、图标和文字表达。
- 所有写 Route Handler 使用同源校验、严格 Zod 输入和统一错误结构；不得相信客户端传入的角色、用户或统计值。
- 保留冻结原型与原型状态测试；真实页面不得导入原型内存演示数据。

## 阶段验收标准

1. 同一代理重复标记同一宿舍只更新原记录，数据库始终最多一条当前记录；无内容变化时 `updatedAt` 与审计数量不变。
2. 代理无法创建、修改或删除其他代理记录，撤销学校授权后旧页面和所有写接口立即返回 403。
3. 创建、实际修改、管理员删除都留下包含操作人、动作、前后状态和前后备注的审计快照，且与业务变更原子提交。
4. 修改、停用或删除快捷备注后，旧 `SweepRecord.note` 与 `SweepAudit.beforeNote/afterNote` 保持原文字。
5. 宿舍整体状态严格满足 `已覆盖 > 待补扫 > 未扫`，管理员删除当前记录后立即重新计算。
6. 楼栋矩阵按楼层展示灰/黄/绿三态、顶部数量和“我扫过”星号；楼栋选择卡片同步显示三态概况。
7. 无我的记录点击宿舍进入新增编辑器；有我的记录进入详情；详情只展示我的记录，历史独立页面每位代理只展示一条最新结果。
8. 批量流程为“选择宿舍 → 设置统一状态和备注 → 保存”，标题列出具体宿舍号；任意目标失败时整批不写入并保留选择。
9. 管理员可真实维护两组快捷备注并排序/启停，可筛选、编辑、删除当前记录并只读查询审计。
10. lint、类型检查、单元测试、数据库集成测试、生产构建、部署合同测试、浏览器测试和冻结原型合同全部通过。

## Review Focus

- 并发提交同一“代理 × 宿舍”时只能保留一条当前记录，每次真实状态变化都有且只有一条审计；由 Task 2 的并发集成测试覆盖。
- 批量请求混入其他楼栋、停用宿舍、重复 ID 或无权限宿舍时整批回滚；由 Task 3 的事务测试覆盖。
- 快捷备注在打开编辑器后被停用或删除时，保存请求不能借旧 ID 绕过配置状态；由 Task 2 的写服务集成测试覆盖。
- 管理员删除最后一条 `COVERED` 后，应按剩余记录降级为 `PENDING` 或 `UNVISITED`；由 Task 7 的删除测试覆盖。
- 编辑器网络失败、重复点击和带未保存内容离开时，必须保留输入且不产生重复提交；由 Task 6 的组件与 E2E 测试覆盖。

---

### Task 1：快捷备注领域、接口与管理员维护

**文件：**
- Create: `src/modules/quick-notes/quick-note-schema.ts`
- Create: `src/modules/quick-notes/quick-note-service.ts`
- Test: `src/modules/quick-notes/quick-note-service.integration.test.ts`
- Create: `src/app/api/quick-notes/route.ts`
- Create: `src/app/api/admin/quick-notes/route.ts`
- Create: `src/app/api/admin/quick-notes/[quickNoteId]/route.ts`
- Create: `src/app/api/admin/quick-notes/reorder/route.ts`
- Test: `src/app/api/quick-note-routes.integration.test.ts`
- Create: `src/app/(protected)/admin/quick-notes/page.tsx`
- Create: `src/modules/quick-notes/admin/quick-note-manager.tsx`
- Test: `src/modules/quick-notes/admin/quick-note-manager.test.tsx`
- Modify: `src/app/globals.css`

**接口：**
- Consumes: `requireAgentRequest`, `requireAdminRequest`, `parseJson`, `requireSameOrigin`, Prisma `QuickNote`。
- Produces: `listActiveQuickNotes(status)`, `listQuickNotesForAdmin()`, `createQuickNote(input)`, `updateQuickNote(id, input)`, `setQuickNoteActive(id, isActive)`, `deleteQuickNote(id)`, `reorderQuickNotes(status, orderedIds)`, `resolveQuickNoteSnapshot({ quickNoteId, status })`；代理 GET 与管理员 CRUD/排序接口；`/admin/quick-notes`。

- [ ] **Step 1: 写失败的服务与接口测试**：覆盖按状态/顺序读取、空白/重复内容、末尾新增、编辑、启停、删除、同组完整排序、跨组排序 ID 拒绝，以及代理不能调用管理员接口。
- [ ] **Step 2: 验证 RED**：运行 `npm run test:integration -- src/modules/quick-notes/quick-note-service.integration.test.ts src/app/api/quick-note-routes.integration.test.ts`，预期因模块或路由不存在失败。
- [ ] **Step 3: 实现严格 schema、事务服务与 Route Handlers**：内容 trim 后长度 1–60；同状态内内容大小写敏感去重；排序提交必须恰好包含该状态全部记录 ID。
- [ ] **Step 4: 验证 GREEN**：重复 Step 2 命令并运行完整 `npm run test:integration`，预期全部通过。
- [ ] **Step 5: 写失败的管理员组件测试**：覆盖待补扫/已覆盖分组、增改删、启停、上移/下移、危险操作和历史文本不会变化的提示。
- [ ] **Step 6: 实现真实管理员页面并验证**：运行 `npm test -- src/modules/quick-notes/admin/quick-note-manager.test.tsx && npm run lint && npm run typecheck`，预期全部通过。
- [ ] **Step 7: 提交**：`git commit -am "feat: add quick note management"`（先显式 `git add` 新文件）。

### Task 2：单条扫楼记录、状态聚合与不可变审计

**文件：**
- Create: `src/modules/sweep/sweep-types.ts`
- Create: `src/modules/sweep/sweep-schema.ts`
- Create: `src/modules/sweep/sweep-status.ts`
- Test: `src/modules/sweep/sweep-status.test.ts`
- Create: `src/modules/sweep/sweep-record-service.ts`
- Test: `src/modules/sweep/sweep-record-service.integration.test.ts`

**接口：**
- Consumes: Prisma `SweepRecord`/`SweepAudit`, `assertAgentSchoolAccess`, `resolveQuickNoteSnapshot`, authenticated operator。
- Produces: `deriveOverallStatus(statuses): "UNVISITED" | "PENDING" | "COVERED"`; `upsertAgentRecord({ dormitoryId, agentId, status, quickNoteId?, customNote? }, operator)`；`getDormitoryOverallStatus(dormitoryId)`；内部事务函数 `upsertRecordInTransaction(tx, input, operatorId)` 供批量和管理员复用。

- [ ] **Step 1: 写失败的纯状态测试**：空数组为 `UNVISITED`、只有待补扫为 `PENDING`、任意已覆盖为 `COVERED`，顺序不影响结果。
- [ ] **Step 2: 验证 RED**：运行 `npm test -- src/modules/sweep/sweep-status.test.ts`，预期模块不存在失败。
- [ ] **Step 3: 实现最小状态函数并验证 GREEN**：重复 Step 2，预期通过。
- [ ] **Step 4: 写失败的数据库集成测试**：覆盖创建+CREATE 审计、更新原行+UPDATE 审计、备注空值规范化、`quickNoteId` 与 `customNote` 互斥、快捷备注状态匹配、旧/停用 ID 拒绝、无语义变化、不允许代理指定其他 `agentId`、停用对象/撤销授权拒绝、快捷备注文字快照不被配置变化污染，以及并发唯一性。
- [ ] **Step 5: 验证 RED**：运行 `npm run test:integration -- src/modules/sweep/sweep-record-service.integration.test.ts`，预期服务不存在失败。
- [ ] **Step 6: 实现事务内 upsert 核心**：在事务内读取并锁定语义目标，比较规范化后的状态/备注；只对真实变化写一条审计；唯一冲突重读并转为更新，不产生第二条当前记录。
- [ ] **Step 7: 验证 GREEN**：运行目标测试和完整 `npm run test:integration`，预期全部通过。
- [ ] **Step 8: 提交**：`git commit -m "feat: add audited sweep record core"`。

### Task 3：代理单条与批量写接口

**文件：**
- Create: `src/app/api/dormitories/[dormitoryId]/my-record/route.ts`
- Create: `src/app/api/sweep-records/batch/route.ts`
- Test: `src/app/api/sweep-record-routes.integration.test.ts`
- Modify: `src/modules/sweep/sweep-record-service.ts`
- Modify: `src/modules/sweep/sweep-schema.ts`

**接口：**
- Consumes: Task 2 事务核心、`requireAgentRequest`, `requireSameOrigin`, `parseJson`。
- Produces: `PUT /api/dormitories/:id/my-record`; `POST /api/sweep-records/batch`; `upsertAgentRecordsBatch({ agentId, buildingId, dormitoryIds, status, quickNoteId?, customNote? }, operator)`。

- [ ] **Step 1: 写失败的 Route Handler 与批量事务测试**：覆盖会话派生代理、伪造身份字段拒绝、单条 upsert、ID 去重、最多 100 间、具体楼栋归属、停用/不存在目标、撤销授权、已有记录更新、没有记录新建、无变化跳过审计和任意目标失败时全部回滚。
- [ ] **Step 2: 验证 RED**：运行 `npm run test:integration -- src/app/api/sweep-record-routes.integration.test.ts`，预期路由或批量服务不存在失败。
- [ ] **Step 3: 实现严格写 schema、同源保护和原子批量服务**：整个目标验证与所有 upsert 在单个 `$transaction` 内完成，响应返回每个宿舍新整体状态和楼栋三态计数。
- [ ] **Step 4: 验证 GREEN**：运行目标测试与完整集成套件，预期全部通过。
- [ ] **Step 5: 提交**：`git commit -m "feat: add agent sweep write APIs"`。

### Task 4：楼栋概况与矩阵读模型

**文件：**
- Modify: `src/modules/campus/campus-types.ts`
- Modify: `src/modules/campus/campus-read-service.ts`
- Modify: `src/modules/campus/campus-read-service.integration.test.ts`
- Create: `src/modules/sweep/sweep-read-service.ts`
- Test: `src/modules/sweep/sweep-read-service.integration.test.ts`
- Create: `src/app/api/buildings/[buildingId]/matrix/route.ts`
- Test: `src/app/api/sweep-read-routes.integration.test.ts`
- Modify: `src/modules/campus/agent/building-list.tsx`
- Modify: `src/modules/campus/agent/building-list.test.tsx`

**接口：**
- Consumes: 当前代理身份、学校授权、全部有效当前记录。
- Produces: `getBuildingMatrixForAgent(agentId, buildingId, floor?)`; 楼栋 DTO 的 `counts: { covered, pending, unvisited }`；矩阵宿舍 DTO 的 `overallStatus` 与 `hasMyRecord`。

- [ ] **Step 1: 写失败的集成测试**：用多代理记录证明三态优先级、只统计有效宿舍、星号只取当前代理、楼层过滤、楼栋总数、撤销授权和停用学校/楼栋拒绝。
- [ ] **Step 2: 验证 RED**：运行两个读服务测试文件，预期新 DTO/服务缺失失败。
- [ ] **Step 3: 实现聚合查询**：一次读取有效宿舍及当前记录，在服务端派生状态与计数；不在 `Dormitory` 上缓存整体状态。
- [ ] **Step 4: 实现矩阵 GET 与楼栋卡片概况并验证**：运行目标集成测试、楼栋组件测试和完整单元/集成套件。
- [ ] **Step 5: 提交**：`git commit -m "feat: add building sweep matrix read model"`。

### Task 5：真实楼栋矩阵与两步批量选择

**文件：**
- Replace: `src/modules/campus/agent/dormitory-directory.tsx`
- Create: `src/modules/sweep/agent/building-matrix.tsx`
- Test: `src/modules/sweep/agent/building-matrix.test.tsx`
- Create: `src/modules/sweep/agent/batch-selection.ts`
- Test: `src/modules/sweep/agent/batch-selection.test.ts`
- Modify: `src/app/(protected)/app/buildings/[buildingId]/page.tsx`
- Create: `src/app/(protected)/app/buildings/[buildingId]/batch/page.tsx`
- Modify: `src/app/globals.css`

**接口：**
- Consumes: Task 4 矩阵 DTO 与 `?floor=`；浏览器 `sessionStorage` 仅保存返回体验所需的楼层和批量选择。
- Produces: 灰/黄/绿矩阵、三态计数、楼层切换、我的记录星号、批量选择页与具体房号标题。

- [ ] **Step 1: 写失败的状态与组件测试**：覆盖三态文字/图标/颜色类、星号、点击分流 URL、默认/查询楼层、选择切换、返回保留选择、没有选择时禁用下一步和标题列出全部宿舍号。
- [ ] **Step 2: 验证 RED**：运行对应单元测试，预期组件/状态模块不存在失败。
- [ ] **Step 3: 实现矩阵与批量选择最小交互**：普通点击根据 `hasMyRecord` 分别链接详情或记录页；批量模式才允许多选。
- [ ] **Step 4: 验证 GREEN 与移动端尺寸**：运行目标测试、完整单元套件、lint 和类型检查。
- [ ] **Step 5: 提交**：`git commit -m "feat: add sweep matrix and batch selection"`。

### Task 6：统一记录编辑器、宿舍详情与历史页

**文件：**
- Create: `src/modules/sweep/agent/record-editor.tsx`
- Test: `src/modules/sweep/agent/record-editor.test.tsx`
- Create: `src/modules/sweep/agent/use-record-editor.ts`
- Test: `src/modules/sweep/agent/use-record-editor.test.ts`
- Create: `src/modules/sweep/sweep-read-service.ts` (extend)
- Modify: `src/modules/sweep/sweep-read-service.integration.test.ts`
- Create: `src/app/api/dormitories/[dormitoryId]/route.ts`
- Create: `src/app/api/dormitories/[dormitoryId]/history/route.ts`
- Create: `src/app/(protected)/app/dormitories/[dormitoryId]/page.tsx`
- Create: `src/app/(protected)/app/dormitories/[dormitoryId]/record/page.tsx`
- Create: `src/app/(protected)/app/dormitories/[dormitoryId]/history/page.tsx`
- Modify: `src/app/(protected)/app/buildings/[buildingId]/batch/page.tsx`
- Modify: `src/app/globals.css`

**接口：**
- Consumes: Tasks 1、3、4 API；`getDormitoryDetailForAgent`, `getDormitoryLatestRecordsForAgent`。
- Produces: 新增/编辑/批量共用 `RecordEditor`; 详情仅显示整体状态和我的记录；独立历史页按 `updatedAt desc` 每位代理一条当前结果。

- [ ] **Step 1: 写失败的读服务与路由测试**：覆盖无我的记录详情重定向信号、详情不返回其他代理卡片、历史只返回各代理当前结果、排序、备注空值、权限撤销和停用宿舍。
- [ ] **Step 2: 验证 RED**：运行目标集成测试，预期详情/历史接口缺失失败。
- [ ] **Step 3: 实现详情/历史读模型和页面服务端保护**，验证目标与完整集成套件。
- [ ] **Step 4: 写失败的统一编辑器测试**：三种标题/初值/返回目标、两种状态、最多五条可视快捷备注且内部滚动、自定义/空备注、60 字限制、保存中禁用、成功延时返回矩阵、失败保留全部输入并可重试、未保存离开确认与批量原子错误文案。
- [ ] **Step 5: 验证 RED**：运行编辑器测试，预期组件不存在失败。
- [ ] **Step 6: 实现同一编辑器组件并接入三种页面**：编辑已有但不再匹配启用快捷备注的文字时按自定义备注预填；成功后 `router.replace` 回带原 `floor` 的矩阵。
- [ ] **Step 7: 验证 GREEN**：运行目标和完整单元套件、lint、类型检查与 build。
- [ ] **Step 8: 提交**：`git commit -m "feat: add agent record detail and editor flows"`。

### Task 7：管理员扫楼数据、纠错删除与审计查询

**文件：**
- Create: `src/modules/sweep/admin/admin-sweep-service.ts`
- Test: `src/modules/sweep/admin/admin-sweep-service.integration.test.ts`
- Create: `src/app/api/admin/sweep-records/route.ts`
- Create: `src/app/api/admin/sweep-records/[recordId]/route.ts`
- Create: `src/app/api/admin/sweep-audits/route.ts`
- Test: `src/app/api/admin/admin-sweep-routes.integration.test.ts`
- Create: `src/app/(protected)/admin/sweep-data/page.tsx`
- Create: `src/modules/sweep/admin/sweep-data-manager.tsx`
- Test: `src/modules/sweep/admin/sweep-data-manager.test.tsx`
- Modify: `src/app/globals.css`

**接口：**
- Consumes: Task 2 事务核心与状态聚合、管理员身份。
- Produces: `listSweepRecords(filters)`, `updateSweepRecordAsAdmin(recordId, input, adminId)`, `deleteSweepRecordAsAdmin(recordId, adminId)`, `listSweepAudits(filters)`；管理员筛选/编辑/删除/只读审计页面。

- [ ] **Step 1: 写失败的服务与路由测试**：覆盖学校/楼栋/房号/代理/状态组合筛选、更新时间倒序、管理员 UPDATE 审计、无变化跳过、DELETE 前快照、删除后整体状态从覆盖降为待补扫再降为未扫、代理角色拒绝和只读审计。
- [ ] **Step 2: 验证 RED**：运行目标集成测试，预期服务/路由不存在失败。
- [ ] **Step 3: 实现管理员事务服务和 Route Handlers**：编辑记录所属代理不变；删除必须二次确认由 UI 承担，服务端始终在删除前写 `DELETE` 审计。
- [ ] **Step 4: 验证 GREEN**：运行目标与完整集成测试。
- [ ] **Step 5: 写失败的管理员组件测试**：覆盖两个页签、五类筛选、当前记录字段、编辑弹窗、危险删除确认、审计前后快照和只读提示。
- [ ] **Step 6: 实现页面并验证**：运行组件测试、完整单元套件、lint 与类型检查。
- [ ] **Step 7: 提交**：`git commit -m "feat: add administrator sweep data management"`。

### Task 8：端到端验收、运行手册与全量质量门

**文件：**
- Create: `e2e/sweep-core.spec.ts`
- Create: `e2e/fixtures/sweep.ts`
- Modify: `docs/development.md`
- Modify: `.github/workflows/ci.yml` only if the existing commands do not already cover the new suite.

**接口：**
- Consumes: Tasks 1–7 全部页面、接口和现有登录/基础数据 fixture。
- Produces: 一条真实数据库驱动的代理主流程和管理员纠错浏览器验收；更新后的本地验证说明。

- [ ] **Step 1: 写失败的 Playwright 测试**：管理员创建两组快捷备注；两个代理对同楼层写入不同状态；验证覆盖优先级、我的星号、无记录/有记录点击分流、单条编辑、两步批量具体标题、详情仅我的记录、历史每代理一条、管理员筛选/修改/删除与审计快照、撤权后旧写页面拒绝，以及关键 48px 触控尺寸。
- [ ] **Step 2: 验证 RED**：运行 `npm run test:e2e -- e2e/sweep-core.spec.ts`，预期在首个未接通行为失败。
- [ ] **Step 3: 只修复验收暴露的接线、焦点、刷新和错误状态问题**，不扩大产品范围。
- [ ] **Step 4: 更新 `docs/development.md`**：记录快捷备注、代理矩阵/单条/批量和管理员纠错的本地冒烟步骤，不写入真实凭据。
- [ ] **Step 5: 运行全量验收**：`npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build && npm run test:deployment && npm run test:e2e && node --test tests/*.test.mjs && pwsh -NoProfile -File tests/prototype-contract.ps1`；预期所有命令退出 0，仅保留既有设备条件跳过。
- [ ] **Step 6: 提交**：`git commit -m "test: cover real sweep core workflows"`。
