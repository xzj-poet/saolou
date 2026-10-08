# Agent Password Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agents replace one-time temporary passwords on first login and after an administrator reset, while preventing access to sweep data until the replacement succeeds.

**Architecture:** Persist a `mustChangePassword` flag on `User`, include it in the authenticated session identity, and enforce it in both server-rendered agent routes and agent business APIs. New and reset agent accounts set the flag; the authenticated change-password endpoint atomically stores a new scrypt hash and clears it. A dedicated, shell-free protected page collects and confirms the new password.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, Zod 4, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-agent-password-lifecycle-design.md`

## Global Constraints

- Apply the flow only to `AGENT` accounts; `ADMIN` accounts retain their current login and navigation behavior.
- Use a minimum password length of exactly 6 characters and no character-class requirement; retain the existing 128-character maximum.
- Temporary passwords remain 16 characters, are returned to the administrator once, and are never persisted or shown again.
- A pending agent may only use the password-change and logout flows; server-rendered agent business pages and agent business APIs must reject or redirect it.
- Administrator reset must atomically replace the hash, set the pending flag, and revoke every existing session for that agent.
- Preserve existing same-origin checks, rate limits, standardized API errors, and scrypt password hashing.

## Review Focus

- A six-character password must be accepted, while five and 129 characters must be rejected; cover this in Task 1 service and schema tests.
- A pending agent must not reach business data through direct JSON API calls, not merely through page navigation; cover this in Task 2 agent-request helper tests.
- An existing agent must remain usable after the migration until an administrator resets it; cover the database default in Task 1 integration tests.
- A successful change must invalidate the old temporary password while retaining the current authenticated session; cover this in Task 2 auth-route integration tests.
- An administrator must neither be redirected to the agent password page nor be allowed to invoke the agent change-password API; cover this in Task 2 layout and API tests.

## Execution Status

- [x] Task 1: Persist and manage the pending-password state
- [x] Task 2: Enforce and complete password change securely
- [x] Task 3: Deliver the agent and administrator interfaces
- [x] Task 4: Run release validation and perform manual acceptance

---

### Task 1: Persist and manage the pending-password state

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_user_must_change_password/migration.sql`
- Modify: `src/modules/auth/password.ts`
- Modify: `src/modules/auth/auth-service.ts`
- Modify: `src/modules/auth/session-repository.ts`
- Modify: `src/modules/agents/agent-admin-service.ts`
- Modify: `src/modules/auth/auth-service.integration.test.ts`
- Modify: `src/modules/auth/session-repository.integration.test.ts`
- Modify: `src/modules/agents/agent-admin-service.integration.test.ts`

**Interfaces:**
- Consumes: Prisma `User` data and `hashPassword(password: string): Promise<string>`.
- Produces: `AuthenticatedUser` with `mustChangePassword: boolean`; `createAgent()` and `resetAgentPassword()` always return agents whose persisted flag is `true`.

- [ ] **Step 1: Write failing integration tests for new agents, reset agents, existing users, and resolved sessions**

Assert that a freshly created agent and a reset agent have `mustChangePassword: true`, their reset invalidates old sessions, a user directly inserted without an explicit field receives the migration default `false`, and `resolveSession()` returns the flag.

- [ ] **Step 2: Run the focused integration tests to verify they fail**

Run: `npm run test:integration -- src/modules/agents/agent-admin-service.integration.test.ts src/modules/auth/session-repository.integration.test.ts`

Expected: FAIL because the model, migration, and authenticated identity do not yet expose `mustChangePassword`.

- [ ] **Step 3: Add the schema field and migration**

Add `mustChangePassword Boolean @default(false) @map("must_change_password")` to `User`, create a PostgreSQL migration that adds a non-null `must_change_password` column defaulting to `false`, then run `npm run db:generate`.

- [ ] **Step 4: Extend authenticated identity and agent administration writes**

Add `mustChangePassword: boolean` to `AuthenticatedUser`, project it from credential authentication and session resolution, and set it to `true` in `createAgent()` and in the same transaction as `resetAgentPassword()`'s password hash and session revocation.

- [ ] **Step 5: Align password validation with the confirmed rule**

Change the shared password validator in `src/modules/auth/password.ts` from `10..128` to `6..128`, and add unit or integration assertions for 6, 5, and 129 characters.

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm run test:integration -- src/modules/agents/agent-admin-service.integration.test.ts src/modules/auth/session-repository.integration.test.ts src/modules/auth/auth-service.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the persistence and service layer**

```bash
git add prisma src/modules/auth/password.ts src/modules/auth/auth-service.ts src/modules/auth/session-repository.ts src/modules/agents/agent-admin-service.ts src/modules/auth/*.test.ts src/modules/agents/agent-admin-service.integration.test.ts
git commit -m "feat: track agent password changes"
```

### Task 2: Enforce and complete password change securely

**Files:**
- Create: `src/modules/auth/change-password-service.ts`
- Create: `src/modules/auth/change-password-schema.ts`
- Create: `src/app/api/auth/change-password/route.ts`
- Modify: `src/app/api/agent-route-helpers.ts`
- Modify: `src/app/(protected)/app/layout.tsx`
- Modify: `src/modules/auth/login-form.tsx`
- Modify: `src/app/api/auth/auth-routes.integration.test.ts`
- Modify: `src/modules/auth/protected-layout.integration.test.tsx`
- Create: `src/modules/auth/change-password-service.integration.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser` with `mustChangePassword`, `requireSameOrigin(request)`, and shared `hashPassword()`.
- Produces: `changePendingAgentPassword(user: AuthenticatedUser, newPassword: string): Promise<void>` and `POST /api/auth/change-password`, which accepts `{ newPassword, confirmPassword }` and returns `{ ok: true }` only for pending agents.

- [ ] **Step 1: Write failing service and route tests for the complete lifecycle**

Test that a pending agent can submit matching six-character passwords, clears the flag, can authenticate with the new password, and cannot authenticate with the old temporary password. Test mismatch, too-short password, ordinary non-pending agent, unauthenticated caller, and administrator caller as explicit failures. Test that `/api/auth/me` includes the non-secret `mustChangePassword` state.

- [ ] **Step 2: Run focused auth tests to verify they fail**

Run: `npm run test:integration -- src/app/api/auth/auth-routes.integration.test.ts src/modules/auth/change-password-service.integration.test.ts`

Expected: FAIL because no change-password schema, service, or route exists.

- [ ] **Step 3: Implement the change-password schema, service, and route**

Create `changePasswordSchema` with strict `{ newPassword, confirmPassword }`, identical 6–128 validation, and a confirmation mismatch error. Implement `changePendingAgentPassword(user, newPassword)` to reject non-agents and non-pending agents with `ApiError`, then update the current user’s `passwordHash` and `mustChangePassword: false` together. The route must use `requireSameOrigin`, resolve the authenticated request user, parse the schema, call the service, and return the standard error response shape.

- [ ] **Step 4: Block direct agent API access while a password change is pending**

Update `requireAgentRequest(request)` to reject a pending agent with a distinct `PASSWORD_CHANGE_REQUIRED` 403 before any route accesses sweep data. Add a representative existing agent API route test using a pending session cookie and assert no data is returned.

- [ ] **Step 5: Redirect pending agent page navigation and route login correctly**

In `src/app/(protected)/app/layout.tsx`, redirect an agent with `mustChangePassword` to `/change-password` before rendering `AppShell`; retain the current administrator redirect. Include `mustChangePassword` in the login response type and route a successfully logged-in pending agent directly to `/change-password`.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `npm run test:integration -- src/app/api/auth/auth-routes.integration.test.ts src/modules/auth/change-password-service.integration.test.ts && npm run test -- src/modules/auth/protected-layout.integration.test.tsx`

Expected: PASS, including the direct API denial and route redirect cases.

- [ ] **Step 7: Commit the enforcement and API layer**

```bash
git add src/app/api/auth/change-password src/app/api/agent-route-helpers.ts src/app/(protected)/app/layout.tsx src/modules/auth
git commit -m "feat: require agents to change temporary passwords"
```

### Task 3: Deliver the agent and administrator interfaces

**Files:**
- Create: `src/app/(protected)/change-password/page.tsx`
- Create: `src/modules/auth/change-password-form.tsx`
- Create: `src/modules/auth/change-password-form.test.tsx`
- Modify: `src/modules/agents/admin/agent-manager.tsx`
- Modify: `src/modules/agents/admin/agent-manager.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/auth/change-password` and the existing logout endpoint.
- Produces: a shell-free `/change-password` page for pending agents; administrator password-result copy that correctly labels the returned value as a temporary password.

- [ ] **Step 1: Write failing component tests for the password form and administrator copy**

Assert that the form exposes two password fields and a logout control, submits exactly `{ newPassword, confirmPassword }`, displays an API validation error, and navigates to `/app/schools` after success. Assert the administrator creation/reset result says “临时密码” and explicitly tells the administrator that the agent must change it after logging in.

- [ ] **Step 2: Run component tests to verify they fail**

Run: `npm run test -- src/modules/auth/change-password-form.test.tsx src/modules/agents/admin/agent-manager.test.tsx`

Expected: FAIL because the change-password form and temporary-password guidance do not yet exist.

- [ ] **Step 3: Implement the standalone password-change page and client form**

Create the protected root page at `/change-password`. It must require an authenticated `AGENT` with `mustChangePassword=true`, redirect an already-complete agent to `/app/schools`, and redirect an administrator to `/admin`. Render a dedicated form without `AppShell`, including account context, new-password and confirmation fields, clear six-character guidance, inline errors, disabled pending state, and a logout action that posts to the existing logout endpoint then replaces the route with `/login`.

- [ ] **Step 4: Update administrator reset/create result wording**

Change `PasswordPanel` and its create/reset usage to label the value “临时密码” and state that it is shown once, must be securely delivered to the agent, and forces the agent to set a new password after login. Keep the existing copy-to-clipboard behavior and never persist the plaintext in client state beyond the open dialog.

- [ ] **Step 5: Add responsive styling using the existing design system**

Add only scoped password-change styles to `src/app/globals.css`, keeping input/button focus behavior and small-screen readability consistent with the existing login card.

- [ ] **Step 6: Run component tests to verify they pass**

Run: `npm run test -- src/modules/auth/change-password-form.test.tsx src/modules/agents/admin/agent-manager.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the user-facing flow**

```bash
git add src/app/(protected)/change-password src/modules/auth/change-password-form.tsx src/modules/auth/change-password-form.test.tsx src/modules/agents/admin/agent-manager.tsx src/modules/agents/admin/agent-manager.test.tsx src/app/globals.css
git commit -m "feat: add agent password change screen"
```

### Task 4: Run release validation and perform manual acceptance

**Files:**
- Modify if generated: `next-env.d.ts`
- Modify: `docs/superpowers/plans/2026-10-09-agent-password-lifecycle.md` (mark completed tasks only after evidence is recorded in the working notes or commit history)

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified migration, production build, and a locally accepted mobile login/change/reset lifecycle.

- [ ] **Step 1: Generate Prisma client and apply the development migration**

Run: `npm run db:generate && npm run db:migrate`

Expected: Prisma client generation and the new migration complete successfully against the local development database.

- [ ] **Step 2: Run static and automated validation**

Run: `npm run lint && npm run typecheck && npm test && npm run build`

Expected: all commands exit with status 0.

- [ ] **Step 3: Manually verify the mobile-sized lifecycle**

Using a newly created agent, verify: temporary-password login opens `/change-password`; a six-character password saves and opens the school page; the temporary password no longer logs in; administrator reset invalidates the active session; the new temporary password reopens the forced change page. Verify the administrator’s one-time dialog calls the value “临时密码”.

- [ ] **Step 4: Inspect final changes and commit generated metadata if changed**

Run: `git diff --check && git status --short`. Stage only feature-owned generated metadata such as `next-env.d.ts` if Next.js changed it as part of this work; preserve all pre-existing mobile-preview edits for their separate review.

