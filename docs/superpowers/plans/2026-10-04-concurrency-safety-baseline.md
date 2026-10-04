# Concurrency Safety Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale or interleaved sweep writes from silently overwriting data while adding a pragmatic internal-SaaS security baseline.

**Architecture:** Add an ID-plus-version concurrency token to each current sweep record, serialize every mutation with one `agentId:dormitoryId` advisory-lock convention, and lock batch targets in stable order before checking any expectation. Surface typed `409 RECORD_CONFLICT` responses to agent and administrator interfaces; keep security single-instance and lightweight with in-memory rate limits, fixed response headers, request-scoped redacted JSON logs, and separate migration/runtime database roles.

**Tech Stack:** Node.js 24, Next.js 16 App Router, TypeScript 5.9, PostgreSQL 18, Prisma 7, Zod, Vitest, Playwright, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-10-04-concurrency-safety-baseline-design.md`

## Global Constraints

- Support one application instance and at most 20 agents concurrently operating one building; do not add Redis, queues, distributed locks, WAF, or external logging.
- A concurrency expectation is always `{ expectedRecordId, expectedVersion }`; the two values must both be null or both be present.
- Check the concurrency expectation before the semantic no-op check.
- Every current-record mutation uses the advisory-lock key `agentId:dormitoryId`; batch targets are locked in ascending dormitory-ID order.
- Any batch conflict rolls back all current-record and audit changes.
- A successful semantic no-op does not increment `version`, change `updatedAt`, or add an audit.
- A conflict never retries or overwrites automatically; it returns `409 RECORD_CONFLICT` and preserves the user's draft.
- Do not log passwords, temporary passwords, cookies, session tokens, request bodies, or note text.
- Use Node.js `>=24 <25`; use locked dependency versions and do not run forced major-version audit fixes.
- Before changing Next.js code, read `AGENTS.md` and the relevant installed guide under `node_modules/next/dist/docs/`.
- Run migrations, integration tests, role-provisioning checks, and load tests only against a disposable test database; never point plan verification commands at production data.
- Continue to derive overall dormitory status from current records; do not persist the aggregate.

## Review Focus

- A record deleted and recreated with version `1` must still conflict with a stale editor holding the old record ID.
- A stale request whose submitted content happens to equal the latest content must conflict rather than pass through the no-op branch.
- Duplicate batch targets with contradictory concurrency tokens must return `400` before any lock or write.
- Two overlapping batches submitted in opposite room order must complete without deadlock and preserve atomicity.
- A forged client-supplied forwarding chain must not bypass the per-source login limit; use the proxy-appended final address.

---

### Task 1: Version column and concurrency primitives

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261004120000_add_sweep_record_version/migration.sql`
- Modify: `src/lib/http/api-error.ts`
- Create: `src/modules/sweep/sweep-concurrency.ts`
- Create: `src/modules/sweep/sweep-concurrency.test.ts`
- Modify: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces: `RecordExpectation`, `CurrentRecordToken`, `SweepRecordConflict`, `detectRecordConflict(current, expectation)`, `recordLockKey(agentId, dormitoryId)`, `sortRecordTargets(targets)`, `lockSweepRecord(tx, agentId, dormitoryId)`, and `recordConflictError(conflicts)`.
- Produces: `ApiErrorFields = Record<string, unknown>` so conflict arrays and existing field-message arrays share the error envelope.

- [ ] **Step 1: Write the failing primitive and migration tests**

Add tests named `detects created updated deleted and ABA conflicts`, `sorts targets by dormitory id without mutating input`, `uses one compound lock key`, and `existing sweep records expose version one`. Assert:

```ts
expect(detectRecordConflict({ id: "new", version: 1 }, { expectedRecordId: "old", expectedVersion: 1 })).toBe("UPDATED");
expect(sortRecordTargets([{ dormitoryId: "b" }, { dormitoryId: "a" }]).map(x => x.dormitoryId)).toEqual(["a", "b"]);
expect(recordLockKey("agent", "dorm")).toBe("agent:dorm");
const rows = await prisma.$queryRaw<Array<{ version: number }>>`SELECT version FROM sweep_records WHERE id = ${id}`;
expect(rows[0]?.version).toBe(1);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run src/modules/sweep/sweep-concurrency.test.ts && npm run test:integration -- --run tests/integration/schema.test.ts`

Expected: FAIL because the module and `version` column do not exist.

- [ ] **Step 3: Add the version migration and minimal primitives**

Add `version Int @default(1)` mapped to `version`. Implement pure conflict detection before any no-op logic; validate the record-ID/version pair in schemas later, not in the primitive. `recordConflictError` must create `ApiError(409, "RECORD_CONFLICT", ...)` with `fields.conflicts`.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `npm run db:generate && npm test -- --run src/modules/sweep/sweep-concurrency.test.ts && npm run test:integration -- --run tests/integration/schema.test.ts`

Expected: all focused tests PASS and migrated records read as version `1`.

- [ ] **Step 5: Commit**

```bash
git add prisma src/lib/http/api-error.ts src/modules/sweep tests/integration/schema.test.ts
git commit -m "feat: add sweep record concurrency tokens"
```

### Task 2: Optimistic concurrency for single-record writes

**Files:**
- Modify: `src/modules/sweep/sweep-types.ts`
- Modify: `src/modules/sweep/sweep-schema.ts`
- Modify: `src/modules/sweep/sweep-record-service.ts`
- Modify: `src/modules/sweep/sweep-read-service.ts`
- Modify: `src/modules/sweep/sweep-record-service.integration.test.ts`
- Modify: `src/modules/sweep/sweep-detail-service.integration.test.ts`
- Modify: `src/app/api/sweep-record-routes.integration.test.ts`
- Modify: `src/app/api/dormitories/[dormitoryId]/my-record/route.ts`

**Interfaces:**
- Consumes: Task 1 concurrency primitives.
- Produces: `SweepRecordInput extends RecordExpectation`.
- Produces: `writeLockedSweepRecord(tx, input, operatorId)` for callers that already hold the compound lock.
- Preserves: `upsertAgentRecord(input, operator)` as the public single-record service.

- [ ] **Step 1: Write failing service and route tests**

Add tests that assert:

```ts
const created = await upsertAgentRecord({ ...base, expectedRecordId: null, expectedVersion: null }, operator);
expect(created.record).toMatchObject({ version: 1 });
await expect(upsertAgentRecord({ ...edit, expectedRecordId: created.record.id, expectedVersion: 1 }, operator))
  .resolves.toMatchObject({ record: { version: 2 } });
await expect(staleSameContent).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });
await expect(abaSameVersionDifferentId).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });
```

Route tests must reject a half-null token with `400`, return the stable `409` envelope, and include `id` plus `version` in the detail read model.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm run test:integration -- --run src/modules/sweep/sweep-record-service.integration.test.ts src/modules/sweep/sweep-detail-service.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts`

Expected: FAIL because request schemas and services do not accept or enforce concurrency tokens.

- [ ] **Step 3: Implement lock-check-write ordering**

Update `sweepRecordInputSchema` and `sweepWriteBodySchema` with the paired-token refinement. In `upsertAgentRecord`, validate authorization, acquire the compound lock, reread current state, check ID/version, then resolve the note and decide create/update/no-op. Increment with `{ version: { increment: 1 } }` only on a real update.

- [ ] **Step 4: Run focused and complete integration suites**

Run: `npm run test:integration -- --run src/modules/sweep/sweep-record-service.integration.test.ts src/modules/sweep/sweep-detail-service.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts && npm run test:integration`

Expected: focused tests and all integration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sweep src/app/api/dormitories src/app/api/sweep-record-routes.integration.test.ts
git commit -m "feat: reject stale single sweep writes"
```

### Task 3: Stable locking and atomic conflicts for batch writes

**Files:**
- Modify: `src/modules/sweep/sweep-schema.ts`
- Modify: `src/modules/sweep/sweep-record-service.ts`
- Modify: `src/modules/sweep/sweep-record-service.integration.test.ts`
- Modify: `src/app/api/sweep-record-routes.integration.test.ts`
- Modify: `src/modules/sweep/sweep-read-service.ts`
- Modify: `src/modules/sweep/sweep-read-service.integration.test.ts`
- Modify: `src/modules/sweep/agent/building-matrix.tsx`
- Modify: `src/modules/sweep/agent/building-matrix.test.tsx`
- Modify: `src/modules/sweep/agent/record-editor.tsx`
- Modify: `src/modules/sweep/agent/record-editor.test.tsx`

**Interfaces:**
- Consumes: `lockSweepRecord`, `sortRecordTargets`, `detectRecordConflict`, and `writeLockedSweepRecord`.
- Produces: `SweepBatchTarget = { dormitoryId; expectedRecordId; expectedVersion }` and `SweepBatchInput.targets`.
- Produces in matrix DTO: `myRecordId: string | null` and `myRecordVersion: number | null`.
- Changes the `RecordEditor` dormitory prop to carry the paired token and sends `targets`, not `dormitoryIds`, in batch mode.

- [ ] **Step 1: Write failing batch tests**

Cover `locks reversed overlapping batches without deadlock`, `rolls back every write and audit when one target is stale`, `deduplicates identical targets`, and `rejects duplicate IDs with contradictory tokens`. Assert the matrix returns the current agent's ID/version but no other agent token.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:integration -- --run src/modules/sweep/sweep-record-service.integration.test.ts src/modules/sweep/sweep-read-service.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts`

Expected: FAIL because batch bodies still use `dormitoryIds` and lock in caller order.

- [ ] **Step 3: Implement prelock, aggregate check, then write**

Parse `targets` with paired-token refinement. Normalize identical duplicates, reject contradictory duplicates before opening the transaction, validate all dormitories, acquire every compound lock in sorted order, reread all current records, aggregate every conflict, and only then call `writeLockedSweepRecord` for each target.

- [ ] **Step 4: Update matrix selection payload and verify GREEN**

Have `BatchSelector` pass each selected room's `myRecordId`/`myRecordVersion` into `RecordEditor`, and have `RecordEditor` build the `targets` request body. Run: `npm test -- --run src/modules/sweep/agent/building-matrix.test.tsx src/modules/sweep/agent/record-editor.test.tsx && npm run test:integration -- --run src/modules/sweep/sweep-record-service.integration.test.ts src/modules/sweep/sweep-read-service.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts`

Expected: unit and integration tests PASS with deterministic target ordering.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sweep src/app/api/sweep-record-routes.integration.test.ts
git commit -m "feat: serialize atomic batch sweep writes"
```

### Task 4: Version-safe administrator correction and deletion

**Files:**
- Modify: `src/modules/sweep/admin/admin-sweep-schema.ts`
- Modify: `src/modules/sweep/admin/admin-sweep-service.ts`
- Modify: `src/modules/sweep/admin/admin-sweep-service.integration.test.ts`
- Modify: `src/app/api/admin/sweep-records/[recordId]/route.ts`
- Modify: `src/app/api/admin/admin-sweep-routes.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 lock/conflict helpers and Task 2 locked-write service.
- Produces: `updateSweepRecordAsAdmin(recordId, { expectedRecordId, expectedVersion, customNote, status }, adminId)`.
- Produces: `deleteSweepRecordAsAdmin(recordId, expectedVersion, adminId)`.

- [ ] **Step 1: Write failing administrator race tests**

Test administrator-versus-agent update, administrator-delete-versus-agent-update, stale delete, and delete/recreate ABA. Assert exactly one competing mutation succeeds, failed operations return `409`, final current data matches the winning audit, and no losing audit exists.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:integration -- --run src/modules/sweep/admin/admin-sweep-service.integration.test.ts src/app/api/admin/admin-sweep-routes.integration.test.ts`

Expected: FAIL because administrator writes ignore versions and deletion uses `recordId` as its lock key.

- [ ] **Step 3: Implement exact-record administrator transactions**

Locate the compound key, acquire `agentId:dormitoryId`, reread by compound key, verify path ID and version, then update or delete. A missing path ID returns a `DELETED` conflict when the request supplied a version. Never call generic create-capable upsert from administrator correction.

- [ ] **Step 4: Verify focused and sweep integration suites**

Run: `npm run test:integration -- --run src/modules/sweep/admin/admin-sweep-service.integration.test.ts src/app/api/admin/admin-sweep-routes.integration.test.ts src/modules/sweep/sweep-record-service.integration.test.ts`

Expected: all tests PASS with immutable snapshots matching the winning operation.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sweep/admin src/app/api/admin/sweep-records
git commit -m "feat: guard administrator sweep corrections"
```

### Task 5: Agent conflict recovery and unsaved-change guard

**Files:**
- Create: `src/components/unsaved-changes-provider.tsx`
- Create: `src/components/unsaved-changes-provider.test.tsx`
- Modify: `src/app/(protected)/layout.tsx`
- Modify: `src/components/identity-menu.tsx`
- Modify: `src/components/identity-menu.test.tsx`
- Modify: `src/modules/sweep/agent/use-record-editor.ts`
- Modify: `src/modules/sweep/agent/record-editor.tsx`
- Modify: `src/modules/sweep/agent/record-editor.test.tsx`
- Modify: `src/app/(protected)/app/dormitories/[dormitoryId]/record/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `useUnsavedChanges(dirty: boolean)` and `confirmNavigation(action: () => void): void` from a protected-layout provider.
- Consumes: current record ID/version from the detail DTO.
- Produces: editor conflict state containing server summary and `loadLatestRecord()` behavior.

- [ ] **Step 1: Write failing editor and navigation tests**

Cover empty initial status, disabled save before status selection, request token payload, `409` draft preservation, loading the latest server record, `800ms` success delay, failed-save “尚未保存/重新保存”, internal back confirmation, browser unload, and logout confirmation.

- [ ] **Step 2: Run unit tests and verify RED**

Run: `npm test -- --run src/components/unsaved-changes-provider.test.tsx src/components/identity-menu.test.tsx src/modules/sweep/agent/record-editor.test.tsx`

Expected: FAIL because the provider, nullable status, conflict panel, and delayed navigation do not exist.

- [ ] **Step 3: Implement the shared guard and editor state machine**

Use one provider in the protected layout so editor back actions and `IdentityMenu` consult the same dirty state. Model editor status as `null | PENDING | COVERED`; send paired concurrency tokens; distinguish conflict from network failure; update tokens only when the user loads the latest record.

- [ ] **Step 4: Verify unit suite**

Run: `npm test -- --run src/components/unsaved-changes-provider.test.tsx src/components/identity-menu.test.tsx src/modules/sweep/agent/record-editor.test.tsx && npm test`

Expected: focused and all unit tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/app/\(protected\) src/modules/sweep/agent src/app/globals.css
git commit -m "feat: recover agent editors from conflicts"
```

### Task 6: Administrator and batch conflict presentation

**Files:**
- Modify: `src/modules/sweep/admin/sweep-data-manager.tsx`
- Modify: `src/modules/sweep/admin/sweep-data-manager.test.tsx`
- Modify: `src/modules/sweep/agent/building-matrix.tsx`
- Modify: `src/modules/sweep/agent/building-matrix.test.tsx`
- Modify: `src/modules/sweep/agent/record-editor.tsx`
- Modify: `src/modules/sweep/agent/record-editor.test.tsx`
- Modify: `src/app/(protected)/admin/sweep-data/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 3 aggregate conflict payload and Task 4 record versions.
- Produces: administrator edit/delete requests with expected tokens and refresh-required conflict dialogs.
- Produces: batch conflict panel listing room numbers while keeping selection and editor draft.

- [ ] **Step 1: Write failing component tests**

Assert administrator edit sends `{ expectedRecordId, expectedVersion }`, delete sends `{ expectedVersion }`, stale rows cannot be overwritten, batch conflicts list all returned room numbers, and both interfaces preserve draft/selection until explicit refresh.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/modules/sweep/admin/sweep-data-manager.test.tsx src/modules/sweep/agent/building-matrix.test.tsx src/modules/sweep/agent/record-editor.test.tsx`

Expected: FAIL because current components treat every non-OK response as a generic error.

- [ ] **Step 3: Implement typed conflict presentation**

Parse `error.code` and `fields.conflicts`; do not retry automatically. Administrator refresh closes stale confirmation state and calls `router.refresh()`. `RecordEditor` owns the batch conflict panel and maps returned dormitory IDs to room numbers; batch refresh uses `router.refresh()` without remounting the client selector, so refreshed room tokens arrive while the selected rooms and draft remain in memory. No record is shown as saved after `409`.

- [ ] **Step 4: Verify component and unit suites**

Run: `npm test -- --run src/modules/sweep/admin/sweep-data-manager.test.tsx src/modules/sweep/agent/building-matrix.test.tsx src/modules/sweep/agent/record-editor.test.tsx && npm test`

Expected: focused and all unit tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sweep/admin src/modules/sweep/agent src/app/\(protected\)/admin src/app/globals.css
git commit -m "feat: present sweep write conflicts"
```

### Task 7: Single-instance rate limiting

**Files:**
- Create: `src/lib/http/rate-limit.ts`
- Create: `src/lib/http/rate-limit.test.ts`
- Modify: `src/lib/http/api-error.ts`
- Modify: `src/lib/http/api-response.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/admin/agents/[agentId]/password/route.ts`
- Modify: `src/app/api/dormitories/[dormitoryId]/my-record/route.ts`
- Modify: `src/app/api/sweep-records/batch/route.ts`
- Modify: `src/app/api/auth/auth-routes.integration.test.ts`
- Modify: `src/app/api/sweep-record-routes.integration.test.ts`

**Interfaces:**
- Produces: `consumeRateLimit(key, { limit, windowMs }, now?)` and `sourceAddress(request)`.
- Extends `ApiError` with `responseHeaders?: HeadersInit`, and produces `requireRateLimit(key, policy)` throwing `new ApiError(429, "RATE_LIMITED", message, undefined, { "Retry-After": seconds })`.
- Policies: login source `60/15min`, login source+username `10/15min`, password reset `10/hour/admin`, sweep writes `120/min/user`.

- [ ] **Step 1: Write failing limiter tests**

Test boundary request counts, window reset, lazy stale-bucket cleanup, independent user keys, integer `Retry-After`, and selection of the final address from a forged forwarding chain. Route tests must receive `429` after the exact limit and allow normal requests from distinct users.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/lib/http/rate-limit.test.ts && npm run test:integration -- --run src/app/api/auth/auth-routes.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts`

Expected: FAIL because no limiter or `Retry-After` support exists.

- [ ] **Step 3: Implement minimal fixed-window limits**

Use a process-local `Map`, injected clock for unit tests, lazy cleanup, and no background timers. Apply the source-only login bucket before parsing credentials, the source+username bucket after normalization, and authenticated-user buckets after session resolution.

- [ ] **Step 4: Verify focused and full suites**

Run: `npm test -- --run src/lib/http/rate-limit.test.ts && npm run test:integration -- --run src/app/api/auth/auth-routes.integration.test.ts src/app/api/sweep-record-routes.integration.test.ts && npm test && npm run test:integration`

Expected: all tests PASS and ordinary fixtures do not share exhausted buckets.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http src/app/api/auth src/app/api/admin/agents src/app/api/dormitories src/app/api/sweep-records
git commit -m "feat: rate limit sensitive writes"
```

### Task 8: Security headers and redacted request-aware error logs

**Files:**
- Modify: `next.config.ts`
- Modify: `Caddyfile`
- Create: `src/lib/http/request-context.ts`
- Create: `src/lib/http/request-context.test.ts`
- Modify: `src/lib/http/api-response.ts`
- Create: `src/lib/http/api-response.test.ts`
- Modify: `src/app/api/agent-route-helpers.ts`
- Modify: `src/app/api/admin/campus-route-helpers.ts`
- Modify: all `src/app/api/**/route.ts` catch sites to pass `request`
- Create: `tests/deployment/security-contract.test.mjs`
- Modify: `docs/development.md`

**Interfaces:**
- Produces: `requestId(request)`, `setRequestActor(request, actorId)`, `requestActor(request)`, and `writeApiErrorLog(context)`.
- Changes: `apiErrorResponse(error, request)` adds `x-request-id`, applies error headers, and logs one redacted JSON line.
- Headers: `nosniff`, `DENY`, `same-origin`, minimal `Permissions-Policy`; Caddy sets HSTS on HTTPS responses.

- [ ] **Step 1: Write failing logging and header tests**

Assert valid inbound request IDs are preserved, invalid/oversized IDs are replaced, actor IDs set by auth helpers appear in logs, conflicts log at `info`, forbidden/limited requests at `warn`, unknown errors at `error`, and serialized logs contain none of the supplied password/token/note sentinel strings. Contract-test every mutating route for `requireSameOrigin` and every error catch for `apiErrorResponse(error, request)`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/lib/http/request-context.test.ts src/lib/http/api-response.test.ts && npm run test:deployment`

Expected: FAIL because request context, fixed headers, request IDs, and route contracts do not exist.

- [ ] **Step 3: Implement request context, logs, and headers**

Use a `WeakMap<Request, string>` for actor association and `crypto.randomUUID()` for replacement IDs. Log only the allowlisted fields from the spec. Follow the installed Next.js 16 `next.config` headers documentation; do not add strict CSP.

- [ ] **Step 4: Triage dependency audit without forced upgrades and verify**

Run: `npm audit --json` and record direct production findings plus compatible remediation in `docs/development.md`; do not run `npm audit fix --force`. Then run `npm run lint && npm run typecheck && npm test && npm run test:deployment`.

Expected: application checks PASS; documentation states any accepted remaining audit exposure and why it is not runtime-reachable or not safely upgradable in this stage.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts Caddyfile src/lib/http src/app/api tests/deployment docs/development.md package.json package-lock.json
git commit -m "feat: add pragmatic HTTP security baseline"
```

### Task 9: Separate migration and application database roles

**Files:**
- Create: `scripts/provision-app-role.ts`
- Create: `scripts/verify-app-role.ts`
- Modify: `prisma.config.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `deploy.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/deployment/deployment-contract.test.mjs`
- Create: `tests/deployment/database-role-contract.test.mjs`
- Modify: `README.md`
- Modify: `docs/development.md`

**Interfaces:**
- Environment: `DATABASE_ADMIN_URL` for migration/provision, `DATABASE_URL` for runtime, fixed `POSTGRES_APP_USER=campus_sweep_app`, and generated `POSTGRES_APP_PASSWORD`.
- Scripts: `npm run db:provision:app` idempotently creates/grants the runtime role; `npm run db:verify:app-role` proves CRUD access and rejects schema creation.

- [ ] **Step 1: Write failing deployment contracts**

Assert Compose gives the app only `DATABASE_URL`, provision receives both URLs, deploy generates a separate app password, Prisma migrations prefer `DATABASE_ADMIN_URL`, CI provisions and verifies the app role, and the verification script expects PostgreSQL permission code `42501` for `CREATE TABLE`.

- [ ] **Step 2: Run deployment tests and verify RED**

Run: `npm run test:deployment`

Expected: FAIL because the deployment uses one owner credential.

- [ ] **Step 3: Implement idempotent role provisioning**

Use `pg` with validated fixed role identifiers and escaped password literals. After migrations, grant schema usage plus CRUD/sequence privileges and set owner default privileges. Bootstrap the administrator through the runtime URL. Keep local development compatible when `DATABASE_ADMIN_URL` is omitted.

- [ ] **Step 4: Verify deployment contracts and Compose configuration**

Run: `npm run test:deployment && docker compose --env-file .env.example config --quiet`

Expected: deployment tests PASS and Compose configuration is valid. Start the disposable Compose database with test-only credentials, then run `npm run db:provision:app && npm run db:verify:app-role`; runtime reads/writes succeed and schema creation is rejected. Stop the disposable stack after verification.

- [ ] **Step 5: Commit**

```bash
git add scripts prisma.config.ts package.json package-lock.json .env.example compose.yaml deploy.sh .github tests/deployment README.md docs/development.md
git commit -m "feat: separate runtime database privileges"
```

### Task 10: Concurrent browser acceptance and full release verification

**Files:**
- Modify: `e2e/fixtures/sweep.ts`
- Modify: `e2e/sweep-core.spec.ts`
- Create: `src/modules/sweep/sweep-concurrency-load.integration.test.ts`
- Modify: `docs/development.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deterministic two-context conflict acceptance and a 20-agent database concurrency smoke test.

- [ ] **Step 1: Write failing end-to-end and load acceptance**

Add browser cases for two agent tabs editing one record, administrator edit versus agent edit, stale administrator delete, batch conflict with preserved selection, loading latest content, and explicit resubmission. Add a 20-agent integration test that writes one building concurrently and asserts unique records, expected audits, derived counts, no accidental `429`, and completion within the test timeout.

- [ ] **Step 2: Run acceptance tests and verify RED where wiring is incomplete**

Run: `npm run test:integration -- --run src/modules/sweep/sweep-concurrency-load.integration.test.ts && npm run test:e2e -- e2e/sweep-core.spec.ts`

Expected: any missing final wiring fails with a specific conflict, UI, or count assertion rather than timing out.

- [ ] **Step 3: Apply only acceptance wiring fixes and update runbooks**

Fix fixture token propagation, hydration waits, conflict copy, or deployment smoke commands exposed by Step 2. Document concurrent-conflict manual smoke steps and clarify that backup/restore automation is the next substage.

- [ ] **Step 4: Run the complete quality gate**

Run with Node.js 24 and the test PostgreSQL URL:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:deployment
npm run test:e2e
node --test tests/*.test.mjs
pwsh -NoProfile -File tests/prototype-contract.ps1
git diff --check codex/foundation-auth-deployment...HEAD
```

Expected: every command exits `0`; only documented device-conditional Playwright skips remain.

- [ ] **Step 5: Commit**

```bash
git add e2e src/modules/sweep/sweep-concurrency-load.integration.test.ts docs/development.md README.md
git commit -m "test: verify concurrent sweep safety"
```

## Final Delivery Gate

- [ ] Review the whole branch against the design and Review Focus list.
- [ ] Confirm the worktree is clean and every implementation task has its own commit.
- [ ] Push the branch only after local verification and attach the pull request if one is created.
- [ ] Do not call this stage production-ready until the remote CI passes and a clean-server deployment smoke test succeeds.
