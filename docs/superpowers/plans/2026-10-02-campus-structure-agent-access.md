# Campus Structure and Agent Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the real administrator and agent pages for schools, buildings, dormitories, agent accounts, and per-school agent authorization.

**Architecture:** Extend the existing Next.js modular monolith with campus and agent-management services that own all authorization, derived counts, deletion policy, and transactions. Server Components load initial state directly from those services; client components submit strict same-origin JSON Route Handler requests and refresh server data after successful mutations.

**Tech Stack:** Node.js 24 LTS, Next.js 16.3.8 App Router, React 19.2, TypeScript 5.9, Prisma ORM 7, PostgreSQL 18, Zod, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-campus-sweep-saas-design.md`

## Global Constraints

- This phase implements roadmap Stage 2 only: campus structure, agent accounts, agent school access, and agent school/building selection. Sweep-status matrix behavior and record writes remain Stage 3.
- The product serves one internal team; do not add tenants, plans, billing, self-registration, offline queues, CRM, sales data, Redis, or microservices.
- Every read and write authorization check runs on the server. Client-hidden controls are never a security boundary.
- School and building floor/dormitory counts are derived only from active dormitories; building notes never affect counts.
- Inactive schools, buildings, and dormitories remain visible to administrators and are absent from agent navigation.
- Empty schools/buildings and dormitories with no current or historical sweep data may be permanently deleted. Protected objects are disabled without cascading business history.
- Passwords are generated server-side, shown once, stored only as hashes, and never logged.
- All Route Handler failures use the shared `{ error: { code, message, fields? } }` envelope with Chinese user-facing validation messages.
- Keep the frozen prototype and all existing prototype tests unchanged.

## Review Focus

- If school access is revoked after a page was loaded, the next agent API request or direct URL must return 403/redirect to school selection without deleting prior access-linked business records; covered in Tasks 1 and 6.
- An authenticated agent or forged `agentId` must never invoke administrator campus or account mutations; covered in Tasks 2 and 4.
- A dormitory removal selection containing both protected and unprotected rooms must delete only unprotected rooms and disable protected rooms in one transaction, matching the approved prototype; covered in Task 2.
- Reversed, oversized, empty, or duplicate batch ranges must not partially create dormitories; covered in Task 2.
- Concurrent duplicate school, building, username, or access writes must produce a stable 409/unique result rather than a 500 or duplicate rows; covered in Tasks 2 and 4.

---

### Task 1: Campus read models, derived counts, and authorization

**Files:**
- Create: `src/modules/campus/campus-types.ts`
- Create: `src/modules/campus/campus-read-service.ts`
- Create: `src/modules/campus/campus-read-service.integration.test.ts`

**Interfaces:**
- Consumes: `prisma`; `AuthenticatedUser`; existing `School`, `Building`, `Dormitory`, `AgentSchoolAccess` models.
- Produces: `listCampusTreeForAdmin(): Promise<AdminSchoolSummary[]>`; `listSchoolsForAgent(agentId: string): Promise<AgentSchoolRow[]>`; `listBuildingsForAgent(agentId: string, schoolId: string): Promise<AgentBuildingPage>`; `getDormitoryDirectoryForAgent(agentId: string, buildingId: string): Promise<AgentDormitoryDirectory>`; `assertAgentSchoolAccess(agentId: string, schoolId: string): Promise<void>`.

- [ ] **Step 1: Write failing database integration tests**

Create literal fixtures proving that:

- an administrator sees active and inactive schools/buildings/dormitories;
- a building with active `201`, active `202`, inactive `301`, and a note containing `99层 999间` reports exactly `1层 · 2间宿舍`;
- the agent school list includes every active school with a boolean `isAuthorized`, excludes inactive schools, and does not infer authorization from old sweep data;
- agent building and dormitory-directory reads exclude inactive descendants;
- an ungranted or revoked agent receives `ApiError(403, "SCHOOL_ACCESS_DENIED", ...)` from direct school, building, and dormitory URLs.

- [ ] **Step 2: Run the tests to verify RED**

Run: `npm run test:integration -- src/modules/campus/campus-read-service.integration.test.ts`

Expected: FAIL because the campus read service does not exist.

- [ ] **Step 3: Implement typed campus read models and queries**

Define focused DTOs in `campus-types.ts`. In `campus-read-service.ts`, derive `floorCount` from distinct active `Dormitory.floor` values and `dormitoryCount` from active dormitory rows. Resolve a building's school before checking `AgentSchoolAccess`; never accept a client assertion that access exists.

- [ ] **Step 4: Run targeted and full integration tests**

Run: `npm run test:integration -- src/modules/campus/campus-read-service.integration.test.ts && npm run test:integration`

Expected: the new file passes and the complete integration suite remains green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/campus
git commit -m "feat: add campus read models and authorization"
```

### Task 2: Administrator campus mutations and resource APIs

**Files:**
- Create: `src/modules/campus/dormitory-range.ts`
- Create: `src/modules/campus/dormitory-range.test.ts`
- Create: `src/modules/campus/campus-schema.ts`
- Create: `src/modules/campus/campus-admin-service.ts`
- Create: `src/modules/campus/campus-admin-service.integration.test.ts`
- Create: `src/app/api/admin/schools/route.ts`
- Create: `src/app/api/admin/schools/[schoolId]/route.ts`
- Create: `src/app/api/admin/buildings/route.ts`
- Create: `src/app/api/admin/buildings/[buildingId]/route.ts`
- Create: `src/app/api/admin/buildings/[buildingId]/dormitories/route.ts`
- Create: `src/app/api/admin/buildings/[buildingId]/dormitories/retire/route.ts`
- Create: `src/app/api/admin/dormitories/[dormitoryId]/route.ts`
- Create: `src/app/api/admin/campus-routes.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 read DTOs; `requireRole("ADMIN")`; `requireSameOrigin`; Prisma transactions.
- Produces: `generateDormitoryRange(input): GeneratedDormitory[]`; school/building create, edit, status, and remove-or-disable functions; `previewDormitoryBatch`; `addDormitory`; `addDormitoryBatch`; `retireDormitories`; `setDormitoryActive`; administrator campus Route Handlers.

- [ ] **Step 1: Write failing range-generation unit tests**

Assert literal results for floors 2–3 and rooms 01–03 (`201`…`303`), reversed ranges, values outside 1–99, an empty range, and more than 500 generated rooms. Database-aware duplicate detection belongs to the service tests in Step 4, not this pure generator.

- [ ] **Step 2: Run the range tests to verify RED**

Run: `npm test -- src/modules/campus/dormitory-range.test.ts`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement the pure dormitory range generator**

Use `generateDormitoryRange(input: { floorStart: number; floorEnd: number; roomStart: number; roomEnd: number }): GeneratedDormitory[]`. Produce two-digit room suffixes, stable numeric sort order, and typed validation errors before allocation.

- [ ] **Step 4: Write failing campus mutation and Route Handler tests**

Cover create/edit/status operations, duplicate school/building names as 409, empty-school and empty-building permanent deletion, populated objects becoming inactive, single and batch dormitory creation, duplicate preview, and mixed dormitory retirement. Duplicate preview must report existing room numbers separately and batch creation must skip them without partial writes. The mixed test must prove `201` with sweep/audit history becomes inactive while empty `202` is permanently deleted in the same transaction. Verify an agent session and forged identity fields receive 403/400 and make no changes.

- [ ] **Step 5: Run mutation tests to verify RED**

Run: `npm run test:integration -- src/modules/campus/campus-admin-service.integration.test.ts src/app/api/admin/campus-routes.integration.test.ts`

Expected: FAIL because the service and handlers do not exist.

- [ ] **Step 6: Implement strict schemas, transactional services, and handlers**

Normalize names by trimming, enforce non-empty names and room numbers, cap notes at 500 characters, and perform permanent-delete policy checks inside the mutation transaction. `retireDormitories(buildingId, dormitoryIds)` must partition and atomically delete never-used rooms while disabling rooms with any `SweepRecord` or `SweepAudit`; return both literal room-number lists and refreshed building counts.

- [ ] **Step 7: Run Task 2 checks**

Run: `npm test -- src/modules/campus/dormitory-range.test.ts && npm run test:integration -- src/modules/campus/campus-admin-service.integration.test.ts src/app/api/admin/campus-routes.integration.test.ts && npm test && npm run test:integration`

Expected: all targeted and complete unit/integration suites pass.

- [ ] **Step 8: Commit**

```bash
git add src/modules/campus src/app/api/admin
git commit -m "feat: add administrator campus operations"
```

### Task 3: Administrator campus management interface

**Files:**
- Create: `src/app/(protected)/admin/campus/page.tsx`
- Create: `src/modules/campus/admin/campus-manager.tsx`
- Create: `src/modules/campus/admin/campus-manager.test.tsx`
- Create: `src/modules/campus/admin/campus-dialog.tsx`
- Create: `src/modules/campus/admin/building-blueprint.tsx`
- Create: `src/components/admin-navigation.tsx`
- Create: `src/components/admin-navigation.test.tsx`
- Modify: `src/app/(protected)/admin/page.tsx`
- Modify: `src/components/admin-shell.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 `listCampusTreeForAdmin`; Task 2 administrator campus handlers.
- Produces: `/admin/campus`; school-only accordion; building cards; context menus; centered forms; near-full-screen neutral dormitory blueprint; unified dormitory manager with single, batch, and delete/disable tabs.

- [ ] **Step 1: Write failing component tests**

Assert that only schools are accordions, a building card body opens the blueprint while its independent three-dot button does not, school/building menus expose the approved actions, derived `1层 · 2间宿舍` text is rendered from DTO values, floor headers have no action buttons, and dormitory management uses three tabs. Assert destructive actions are exposed with an accessible danger treatment; exact rendered target sizes are verified in Task 7.

- [ ] **Step 2: Run component tests to verify RED**

Run: `npm test -- src/modules/campus/admin/campus-manager.test.tsx src/components/admin-navigation.test.tsx`

Expected: FAIL because the management interface does not exist.

- [ ] **Step 3: Implement the server page and client interactions**

Keep one school open at a time and preserve its id in `?school=`. Use one controlled context menu and one reusable dialog host. On successful mutations, close or retain the relevant modal as specified, announce a concise result via `aria-live`, and call `router.refresh()` without losing the open school. Build the dormitory batch preview from the server response, not a client-only duplicate calculation.

- [ ] **Step 4: Run component and accessibility checks**

Run: `npm test -- src/modules/campus/admin/campus-manager.test.tsx src/components/admin-navigation.test.tsx && npm test && npm run lint && npm run typecheck`

Expected: all component/full unit tests, lint, and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(protected\)/admin src/components src/modules/campus/admin src/app/globals.css
git commit -m "feat: add administrator campus management interface"
```

### Task 4: Agent accounts and school-access services

**Files:**
- Create: `src/modules/agents/agent-schema.ts`
- Create: `src/modules/agents/temporary-password.ts`
- Create: `src/modules/agents/temporary-password.test.ts`
- Create: `src/modules/agents/agent-admin-service.ts`
- Create: `src/modules/agents/agent-admin-service.integration.test.ts`
- Create: `src/app/api/admin/agents/route.ts`
- Create: `src/app/api/admin/agents/[agentId]/route.ts`
- Create: `src/app/api/admin/agents/[agentId]/password/route.ts`
- Create: `src/app/api/admin/agents/[agentId]/school-access/route.ts`
- Create: `src/app/api/admin/agent-routes.integration.test.ts`

**Interfaces:**
- Consumes: `hashPassword`; `requireRole("ADMIN")`; `requireSameOrigin`; `User`, `Session`, `AgentSchoolAccess`, and `School` models.
- Produces: `listAgentsForAdmin`; `createAgent`; `renameAgent`; `setAgentStatus`; `resetAgentPassword`; `replaceAgentSchoolAccess`; corresponding administrator Route Handlers. Password-returning operations return plaintext only in that response.

- [ ] **Step 1: Write failing temporary-password tests**

Assert two calls produce different 16-character passwords containing upper, lower, digit, and non-ambiguous symbols, and that every generated value passes the existing password boundary.

- [ ] **Step 2: Run the unit test to verify RED**

Run: `npm test -- src/modules/agents/temporary-password.test.ts`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement the password generator**

Use Node cryptographic randomness and guarantee the required character groups without modulo bias.

- [ ] **Step 4: Write failing service and route tests**

Cover unique normalized usernames, create/rename, disable/enable without losing records or access, session revocation on disable and password reset, one-time password responses, overwrite semantics for the complete school-id set, zero-school access, duplicate school ids, nonexistent/inactive schools, concurrent duplicate grants, agent-role rejection, and rejection of forged role/user fields.

- [ ] **Step 5: Run integration tests to verify RED**

Run: `npm run test:integration -- src/modules/agents/agent-admin-service.integration.test.ts src/app/api/admin/agent-routes.integration.test.ts`

Expected: FAIL because the service and handlers do not exist.

- [ ] **Step 6: Implement services and strict Route Handlers**

All account mutations use the session administrator as actor. Disable and password reset delete all target sessions in the same transaction. Access replacement validates the target is an agent, validates every unique school id, deletes stale grants, creates missing grants, and never changes sweep history.

- [ ] **Step 7: Run Task 4 checks**

Run: `npm test -- src/modules/agents/temporary-password.test.ts && npm run test:integration -- src/modules/agents/agent-admin-service.integration.test.ts src/app/api/admin/agent-routes.integration.test.ts && npm test && npm run test:integration`

Expected: all targeted and complete unit/integration suites pass.

- [ ] **Step 8: Commit**

```bash
git add src/modules/agents src/app/api/admin/agents
git commit -m "feat: add agent account and school access services"
```

### Task 5: Administrator agent-management interface

**Files:**
- Create: `src/app/(protected)/admin/agents/page.tsx`
- Create: `src/modules/agents/admin/agent-manager.tsx`
- Create: `src/modules/agents/admin/agent-manager.test.tsx`
- Create: `src/modules/agents/admin/agent-dialog.tsx`
- Modify: `src/components/admin-navigation.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 4 list service and Route Handlers; Task 1 administrator school rows.
- Produces: `/admin/agents`; full-width agent rows; account context menus; create/rename/access/status/password dialogs; one-time password copy panel.

- [ ] **Step 1: Write failing component tests**

Assert each row displays name, username, status, and authorized-school tags; the three-dot menu has exactly rename/access/reset/status actions; access uses the complete school checkbox list; zero access can be saved; and create/reset password results are visible only in the current dialog with copy affordance and the approved one-time warning.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/modules/agents/admin/agent-manager.test.tsx`

Expected: FAIL because the interface does not exist.

- [ ] **Step 3: Implement the server page and client manager**

Never store returned plaintext passwords in URL, local storage, logs, or server-rendered props. Clear them when the dialog closes. Refresh list data after successful writes while preserving the active dialog only for one-time password display.

- [ ] **Step 4: Run component and full frontend checks**

Run: `npm test -- src/modules/agents/admin/agent-manager.test.tsx && npm test && npm run lint && npm run typecheck`

Expected: all tests and static checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(protected\)/admin/agents src/modules/agents/admin src/components/admin-navigation.tsx src/app/globals.css
git commit -m "feat: add administrator agent management interface"
```

### Task 6: Agent school, building, and dormitory-directory pages

**Files:**
- Create: `src/app/api/schools/route.ts`
- Create: `src/app/api/schools/[schoolId]/buildings/route.ts`
- Create: `src/app/api/buildings/[buildingId]/directory/route.ts`
- Create: `src/app/api/agent-campus-routes.integration.test.ts`
- Create: `src/app/(protected)/app/schools/[schoolId]/buildings/page.tsx`
- Create: `src/app/(protected)/app/buildings/[buildingId]/page.tsx`
- Create: `src/modules/campus/agent/school-list.tsx`
- Create: `src/modules/campus/agent/school-list.test.tsx`
- Create: `src/modules/campus/agent/building-list.tsx`
- Create: `src/modules/campus/agent/building-list.test.tsx`
- Create: `src/modules/campus/agent/dormitory-directory.tsx`
- Modify: `src/app/(protected)/app/schools/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 agent read services; Task 4 access rows; `requireRole("AGENT")`.
- Produces: real `/app/schools`, `/app/schools/:schoolId/buildings`, and a neutral Stage-2 `/app/buildings/:buildingId` dormitory directory that Stage 3 will enrich with sweep states and record routing.

- [ ] **Step 1: Write failing API authorization tests**

Assert the school API returns active schools with server-derived `isAuthorized`; building/directory APIs return only active descendants; a query/body `agentId` is rejected or ignored in favor of the session; and revoked access returns 403 on the next request.

- [ ] **Step 2: Run API tests to verify RED**

Run: `npm run test:integration -- src/app/api/agent-campus-routes.integration.test.ts`

Expected: FAIL because the agent campus handlers do not exist.

- [ ] **Step 3: Write failing mobile component tests**

Assert full-row authorized school links, visibly disabled unauthorized rows, a separate building-selection page showing exact derived floor/dormitory counts, neutral floor-grouped dormitory directory, and contextual light-gray back buttons with at least 48px targets. No Stage-3 sweep colors, stars, or record actions may appear yet.

- [ ] **Step 4: Run component tests to verify RED**

Run: `npm test -- src/modules/campus/agent/school-list.test.tsx src/modules/campus/agent/building-list.test.tsx`

Expected: FAIL because the pages/components do not exist.

- [ ] **Step 5: Implement handlers and responsive pages**

Server pages catch only `SCHOOL_ACCESS_DENIED` and redirect to `/app/schools?access=revoked`; unexpected database errors must reach the error boundary. Sort schools/buildings by `sortOrder` then name, floors numerically high-to-low when numeric, and dormitories by `sortOrder` then room number.

- [ ] **Step 6: Run Task 6 checks**

Run: `npm run test:integration -- src/app/api/agent-campus-routes.integration.test.ts && npm test -- src/modules/campus/agent/school-list.test.tsx src/modules/campus/agent/building-list.test.tsx && npm test && npm run test:integration && npm run lint && npm run typecheck`

Expected: API, component, complete test, and static-check suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/schools src/app/api/buildings src/app/api/agent-campus-routes.integration.test.ts src/app/\(protected\)/app src/modules/campus/agent src/app/globals.css
git commit -m "feat: add agent campus navigation pages"
```

### Task 7: Stage-2 browser acceptance and regression gate

**Files:**
- Create: `e2e/campus-agent-access.spec.ts`
- Create: `e2e/fixtures/campus.ts`
- Modify: `.github/workflows/ci.yml` only if a new explicit test command is required.
- Modify: `docs/development.md` with Stage-2 manual verification steps.

**Interfaces:**
- Consumes: Tasks 1–6 pages and Route Handlers.
- Produces: a browser-level acceptance path for the complete Stage-2 deliverable.

- [ ] **Step 1: Write the failing Playwright acceptance test**

Use isolated fixture identifiers and cover this literal path:

1. administrator creates a school and `3号楼` with a misleading numeric note;
2. administrator opens dormitory management and batch-adds `201`, `202`;
3. both administrator and agent views display `1层 · 2间宿舍`;
4. administrator creates an agent, captures the one-time password, grants the school, and the agent can enter its building list;
5. administrator revokes access and the agent's old building URL is rejected on its next navigation;
6. administrator retires `201` (protected fixture) and `202` (empty fixture), observing disable/delete outcomes without losing historical rows;
7. desktop context menus and mobile back controls follow the approved click behavior and minimum sizes.

- [ ] **Step 2: Run E2E to verify RED**

Run: `npm run test:e2e -- e2e/campus-agent-access.spec.ts`

Expected: FAIL at the first unwired Stage-2 interaction.

- [ ] **Step 3: Wire any missing route refresh, focus, and error-state behavior**

Keep fixes within Stage-2 components. Preserve form values on validation/network failure, display field-level Chinese errors, and move focus into opened dialogs and back to their trigger on close.

- [ ] **Step 4: Run the complete Stage-2 verification**

Run: `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build && npm run test:deployment && npm run test:e2e && node --test tests/*.test.mjs && pwsh -NoProfile -File tests/prototype-contract.ps1`

Expected: every command exits 0. The only intentional Playwright skip remains the desktop project copy of the mobile-only 48px assertion.

- [ ] **Step 5: Update the runbook and commit**

Document the administrator campus/agent flow and agent authorization smoke test without exposing credentials.

```bash
git add e2e docs/development.md .github/workflows/ci.yml
git commit -m "test: cover campus and agent access workflows"
```
