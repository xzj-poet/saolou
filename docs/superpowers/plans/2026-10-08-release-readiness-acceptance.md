# V1 Release Readiness Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining user-visible v1 acceptance gaps, prove the full agent workflow locally, and produce release evidence without pushing intermediate work to GitHub.

**Architecture:** Keep the existing Next.js modular monolith and server-rendered data flow. Add focused client components only where interaction requires them, use App Router route-segment boundaries for loading and recoverable errors, and extend Playwright coverage around the exact product acceptance paths. Do not introduce a client cache, offline queue, new service, or new persistence model.

**Tech Stack:** Node.js 24, Next.js 16.3.8 App Router, React 19, TypeScript 5.9, Prisma 7, PostgreSQL 18, Vitest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-29-campus-sweep-saas-design.md`

## Global Constraints

- The product remains a single-team system; do not add multi-tenancy, billing, registration, offline sync, CRM, or reporting.
- Authorization remains server-enforced; UI visibility is never a security boundary.
- Quick notes remain optional snapshots; configuration changes never rewrite saved records or audits.
- Agent read failures keep the current route hierarchy visible and expose an explicit retry of at least 48 px.
- Mobile return controls and primary actions remain at least 48 px high.
- All production code changes follow RED-GREEN TDD.
- Run all verification locally; do not push until the complete release gate is green and the user authorizes the release action.

## Review Focus

- More than five active quick notes must scroll inside a collapsed-by-default picker without pushing the whole editor down.
- A user with visible schools but no authorization must receive a contact-the-administrator message while still seeing authorization states.
- A building with no active dormitories must not offer a meaningless batch action.
- A thrown server-rendering error must keep the protected shell and offer a working retry rather than a blank page.
- Twenty rooms must remain operable on a mobile viewport with two atomic batch submissions and no lost selections.

---

### Task 1: Acceptance Traceability Baseline

**Files:**
- Create: `docs/acceptance/2026-10-08-v1-release-readiness.md`

**Interfaces:**
- Consumes: the 24 frozen acceptance criteria in the product spec and the existing automated test names.
- Produces: a numbered evidence matrix used by Tasks 2-5 and a final release report section for every open gap.

- [ ] **Step 1: Record each frozen acceptance criterion and its current evidence**

Classify each criterion as `covered`, `partial`, or `gap`, naming the exact test or implementation file that supports the classification.

- [ ] **Step 2: Record the four implementation targets**

Pin criteria 1, 7, 8, and 24 to Tasks 2-4; record that all remaining partial findings are documentation-only unless fresh verification disproves their evidence.

- [ ] **Step 3: Verify the matrix is complete**

Run: `rg -n "^\| (?:[1-9]|1[0-9]|2[0-4]) \|" docs/acceptance/2026-10-08-v1-release-readiness.md`

Expected: exactly 24 numbered rows.

- [ ] **Step 4: Commit**

```bash
git add docs/acceptance/2026-10-08-v1-release-readiness.md docs/superpowers/plans/2026-10-08-release-readiness-acceptance.md
git commit -m "docs: map v1 release acceptance"
```

### Task 2: Collapsed Quick-Note Picker

**Files:**
- Create: `src/modules/sweep/agent/quick-note-picker.tsx`
- Create: `src/modules/sweep/agent/quick-note-picker.test.tsx`
- Modify: `src/modules/sweep/agent/record-editor.tsx`
- Modify: `src/modules/sweep/agent/record-editor.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `EditorStatus`, active quick notes, and the existing `useRecordEditor` actions `chooseNone`, `chooseQuick`, and `chooseCustom`.
- Produces: `QuickNotePicker({ notes, noteMode, onChooseCustom, onChooseNone, onChooseQuick, selectedId })` and the same editor request payloads already consumed by sweep APIs.

- [x] **Step 1: Write failing component tests**

Test that the picker is collapsed by default, opens from a full-width button, renders active notes in order, keeps “自定义备注” last, closes after selection, supports clearing the note, and exposes a scrollable option list for six notes.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/modules/sweep/agent/quick-note-picker.test.tsx src/modules/sweep/agent/record-editor.test.tsx`

Expected: FAIL because `QuickNotePicker` and its collapsed interaction do not exist.

- [x] **Step 3: Implement the minimal picker and integrate it**

Use a local expanded state, an `aria-expanded` trigger, one listbox-like option panel, and existing editor actions. Keep custom-note text input behavior and save payloads unchanged.

- [x] **Step 4: Apply the bounded list styling**

Keep the trigger at least 48 px high and bound the open option panel to five 48 px rows with internal vertical scrolling.

- [x] **Step 5: Run focused and full unit suites**

Run: `npm test -- src/modules/sweep/agent/quick-note-picker.test.tsx src/modules/sweep/agent/record-editor.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: all unit test files pass with zero failures.

- [x] **Step 6: Commit**

```bash
git add src/modules/sweep/agent/quick-note-picker.tsx src/modules/sweep/agent/quick-note-picker.test.tsx src/modules/sweep/agent/record-editor.tsx src/modules/sweep/agent/record-editor.test.tsx src/app/globals.css
git commit -m "feat: add collapsed quick note picker"
```

### Task 3: Agent Loading, Empty, and Retry States

**Files:**
- Create: `src/components/agent-page-state.tsx`
- Create: `src/components/agent-page-state.test.tsx`
- Create: `src/app/(protected)/app/loading.tsx`
- Create: `src/app/(protected)/app/error.tsx`
- Modify: `src/modules/campus/agent/school-list.tsx`
- Modify: `src/modules/campus/agent/school-list.test.tsx`
- Modify: `src/modules/sweep/agent/building-matrix.tsx`
- Modify: `src/modules/sweep/agent/building-matrix.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: App Router `error.tsx` retry callback, the existing school authorization flags, and matrix floors.
- Produces: `AgentPageLoading`, `AgentPageError({ retry })`, an explicit no-authorized-school notice, and an empty-building state that omits batch actions.

- [x] **Step 1: Write failing state tests**

Test the loading copy, retry callback, 48 px retry control class, no-authorized-school message, and empty-building behavior with no batch link.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/components/agent-page-state.test.tsx src/modules/campus/agent/school-list.test.tsx src/modules/sweep/agent/building-matrix.test.tsx`

Expected: FAIL because the route state components and missing empty states do not exist.

- [x] **Step 3: Implement shared route states and segment files**

Keep the page shell stable, describe that fresh data could not be loaded, and call only the supplied `retry()` on retry. Do not introduce cached fallback data.

- [x] **Step 4: Implement the two missing empty states**

Show a contact-admin notice when no school is authorized. For zero active dormitories, show a return-oriented empty panel and omit floor navigation and batch marking.

- [x] **Step 5: Run focused and full unit suites**

Run the focused command from Step 2, then `npm test`.

Expected: all tests pass with zero failures.

- [x] **Step 6: Commit**

```bash
git add src/components/agent-page-state.tsx src/components/agent-page-state.test.tsx "src/app/(protected)/app/loading.tsx" "src/app/(protected)/app/error.tsx" src/modules/campus/agent/school-list.tsx src/modules/campus/agent/school-list.test.tsx src/modules/sweep/agent/building-matrix.tsx src/modules/sweep/agent/building-matrix.test.tsx src/app/globals.css
git commit -m "feat: add recoverable agent page states"
```

### Task 4: Browser Acceptance for Scale and Mobile Controls

**Files:**
- Modify: `e2e/fixtures/sweep.ts`
- Modify: `e2e/sweep-core.spec.ts`
- Create: `e2e/release-readiness.spec.ts`

**Interfaces:**
- Consumes: the real login route, matrix/editor UI, batch API, quick-note manager API, and PostgreSQL fixture cleanup.
- Produces: browser evidence for criteria 1, 7, 8, and 24 without changing production interfaces.

- [x] **Step 1: Write a desktop acceptance test for 20 rooms**

Create twenty rooms on one floor, select ten rooms per round through the real matrix UI, save both atomic batches, and assert the matrix reports twenty covered rooms.

- [x] **Step 2: Run it against the completed Tasks 2-3 behavior**

Run: `npx playwright test e2e/release-readiness.spec.ts --project=desktop-chromium`

Expected: PASS. This task adds acceptance evidence for existing batch behavior after Tasks 2-3; it does not introduce production behavior. Any failure is a product finding and must be reproduced in a focused test before production code changes.

- [x] **Step 3: Complete the fixture and browser flow**

Keep generated rows uniquely prefixed and remove sessions, audits, records, access, dormitories, buildings, schools, notes, and users in dependency order.

- [x] **Step 4: Add the mobile primary-control test**

At Pixel 7 dimensions, verify the school row, building row, matrix room, return control, batch action, editor status buttons, picker trigger, and save action are each at least 48 px high.

- [x] **Step 5: Run focused and complete Playwright suites**

Run: `npx playwright test e2e/release-readiness.spec.ts`

Expected: desktop and mobile release-readiness tests pass; project filters are explicit.

Run: `npm run test:e2e`

Expected: all applicable tests pass; only named cross-project filters are skipped.

- [x] **Step 6: Commit**

```bash
git add e2e/fixtures/sweep.ts e2e/sweep-core.spec.ts e2e/release-readiness.spec.ts
git commit -m "test: cover v1 release acceptance paths"
```

### Task 5: Clean Deployment and Recovery Release Gate

**Files:**
- Modify: `docs/acceptance/2026-10-08-v1-release-readiness.md`

**Interfaces:**
- Consumes: the repository's locked toolchain, deployment scripts, PostgreSQL 18 image, Docker image, backup/restore scripts, and all earlier task tests.
- Produces: a dated release evidence section with commands, counts, commit SHA, and any explicit residual risk.

- [ ] **Step 1: Start from disposable PostgreSQL 18 state**

Create uniquely named disposable containers/volumes, run migrations, provision and verify the runtime role, and bootstrap the administrator. Never reuse or remove unrelated user containers or volumes.

- [ ] **Step 2: Run the full local release gate**

Run database generation, lint, typecheck, unit tests, integration tests, production build, deployment tests, real backup/restore integration, Docker Compose validation, Playwright, and Windows backup client tests.

Expected: every applicable check exits 0; deployment and backup integration report zero skipped environment tests.

- [ ] **Step 3: Build and health-check the production image**

Build the `app` target, start it against disposable PostgreSQL state, and verify `/api/health` succeeds before teardown.

- [ ] **Step 4: Record evidence and clean only disposable resources**

Update the acceptance matrix from `partial/gap` to `covered` only where fresh output proves it. Record intentional Playwright project filters separately from environment skips.

- [ ] **Step 5: Verify the final branch**

Run: `git diff --check`, `git status --short`, and the full release commands again if any production file changed after its corresponding check.

Expected: no whitespace errors; only intended release-readiness changes are present before the final commit.

- [ ] **Step 6: Commit without pushing**

```bash
git add docs/acceptance/2026-10-08-v1-release-readiness.md
git commit -m "docs: record v1 release evidence"
```

Stop before merging, pushing, publishing, or deploying to an external server; those are separate user-authorized release actions.
