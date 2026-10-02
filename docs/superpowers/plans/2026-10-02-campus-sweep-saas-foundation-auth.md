# Campus Sweep SaaS Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production application foundation, complete first-version database schema, and secure shared login/session flow that routes administrators and agents into protected application shells.

**Architecture:** Create a single Next.js App Router application at the repository root, with feature code grouped under `src/modules` and all persistence behind Prisma repositories. Store only a hash of each opaque session token in PostgreSQL; server-side guards load the current user on every protected request so disabling an account takes effect immediately.

**Tech Stack:** Node.js 24 LTS, npm, Next.js 16.3.8, React 19.2, TypeScript 5.9, Prisma ORM 7 with PostgreSQL adapter, PostgreSQL 18, Zod, Vitest, Testing Library, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-29-campus-sweep-saas-design.md`

## Global Constraints

- This is one internal team's online-only application; do not add tenants, billing, self-registration, offline queues, sales data, or analytics.
- Use Node.js 24 LTS, Next.js 16.3.8, TypeScript 5.9, Prisma ORM 7, and PostgreSQL 18; commit `package-lock.json` and never resolve `latest` during production builds.
- Keep the existing frozen prototype and prototype tests intact under `docs/prototype` and `tests/*.test.mjs`.
- A browser cookie contains only an opaque random session token; PostgreSQL stores only its SHA-256 hash.
- Every protected request reloads the session and user status from PostgreSQL; a disabled user is denied on the next request.
- The server derives role and user identity from the session; request bodies and query parameters never supply trusted role or agent identity.
- Login errors use Chinese copy from the approved design: `账号或密码错误` for unknown users and wrong passwords, `账号已停用，请联系管理员` for disabled users.
- Use server-side validation for every Route Handler and return a shared `{ error: { code, message, fields? } }` JSON error shape.

## Review Focus

- Unknown username and wrong password must return the same status and message, with no observable account-existence branch in the response.
- Disabled users with previously valid sessions must be denied and have their cookie cleared on their next protected request.
- Expired, revoked, malformed, or unknown session tokens must all behave as unauthenticated requests without throwing.
- A client-supplied `role`, `userId`, or `agentId` must never change the identity resolved from the session.
- Production cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, and expire no later than the matching database session.

---

### Task 1: Application scaffold and quality commands

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.integration.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`
- Create: `src/test/setup.ts`
- Create: `src/app/page.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: frozen prototype only as a visual reference.
- Produces: npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:integration`, and `test:e2e`; import alias `@/* -> src/*`.

- [ ] **Step 1: Write the failing root-page test**

Create `src/app/page.test.tsx` with `it('offers the shared login entry')` and assert that the rendered root page contains the system name and a link whose accessible name is `进入系统` and target is `/login`.

- [ ] **Step 2: Run the test before the application exists**

Run: `npm test -- src/app/page.test.tsx`

Expected: FAIL because `package.json`, the test runner, or `src/app/page.tsx` does not exist.

- [ ] **Step 3: Scaffold the pinned application**

Initialize the root application without deleting `docs` or existing `tests`. Pin `next` to `16.3.8`, `react` and `react-dom` to `19.2.x`, `typescript` to `5.9.x`, and set `engines.node` to `>=24 <25`. Configure unit Vitest to include only `src/**/*.test.ts?(x)`, integration Vitest to include `tests/integration/**/*.test.ts?(x)` and `src/**/*.integration.test.ts?(x)`, and keep the frozen `tests/*.test.mjs` suite separate. Configure the scripts and import alias listed in the Interfaces block.

- [ ] **Step 4: Implement the minimal root page and shared visual tokens**

Implement `RootLayout`, `globals.css`, and `Page()` so the test passes. Establish CSS variables for ink, page, line, green, yellow, muted gray, danger, and a minimum interactive height of `48px`; do not copy the prototype's entire single-file stylesheet.

- [ ] **Step 5: Run the foundation checks**

Run: `npm test -- src/app/page.test.tsx && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0 and the test reports one passing test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts vitest.integration.config.ts playwright.config.ts src/app src/test .gitignore
git commit -m "feat: scaffold production web application"
```

### Task 2: PostgreSQL development environment and complete core schema

**Files:**
- Create: `compose.dev.yaml`
- Create: `.env.example`
- Create: `prisma.config.ts`
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_init/migration.sql`
- Create: `src/generated/prisma/` (generated, ignored except documented generation command)
- Create: `src/lib/env.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/db.test.ts`
- Create: `tests/integration/schema.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `DATABASE_URL` validated by `src/lib/env.ts`.
- Produces: `prisma: PrismaClient`; enums `UserRole`, `UserStatus`, `SweepStatus`, `AuditAction`; models `User`, `AgentSchoolAccess`, `School`, `Building`, `Dormitory`, `QuickNote`, `SweepRecord`, `SweepAudit`, `Session`.

- [ ] **Step 1: Write failing environment and schema tests**

Add `src/lib/db.test.ts` assertions that missing `DATABASE_URL` produces a named configuration error without printing secrets. Add `tests/integration/schema.test.ts` assertions for:

- duplicate `(agentId, dormitoryId)` sweep records are rejected;
- duplicate `(agentId, schoolId)` grants are rejected;
- duplicate `(schoolId, name)` buildings and `(buildingId, roomNo)` dormitories are rejected;
- `SweepAudit.recordId` remains present after the matching `SweepRecord` is deleted;
- deleting a user, school, building, or dormitory with protected descendants is rejected rather than cascaded.

- [ ] **Step 2: Run the schema tests before implementation**

Run: `npm test -- src/lib/db.test.ts && npm run test:integration -- tests/integration/schema.test.ts`

Expected: FAIL because the environment parser, Prisma schema, migration, and database container do not exist.

- [ ] **Step 3: Define the development database and validated environment**

Add PostgreSQL 18 to `compose.dev.yaml` with a named data volume and health check. Define placeholders—not real credentials—in `.env.example`. Export `env` from `src/lib/env.ts` after Zod validation of `DATABASE_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.

- [ ] **Step 4: Implement the Prisma 7 schema and client**

Use UUID primary keys and database timestamps. Encode all unique constraints from the specification. Keep `SweepAudit.recordId` as an immutable UUID snapshot value rather than a cascading foreign key. Use restrictive foreign keys for protected business relationships. Generate the client to `src/generated/prisma` and initialize it in `src/lib/db.ts` with Prisma's PostgreSQL driver adapter.

- [ ] **Step 5: Create and apply the initial migration**

Run: `docker compose -f compose.dev.yaml up -d db && npm run db:migrate -- --name init`

Expected: PostgreSQL becomes healthy and the migration exits 0 without resetting an existing database.

- [ ] **Step 6: Run unit and integration checks**

Run: `npm test -- src/lib/db.test.ts && npm run test:integration -- tests/integration/schema.test.ts`

Expected: all tests pass, including restrictive deletion and unique-constraint cases.

- [ ] **Step 7: Commit**

```bash
git add compose.dev.yaml .env.example prisma.config.ts prisma src/lib package.json package-lock.json .gitignore tests/integration/schema.test.ts
git commit -m "feat: add core database schema"
```

### Task 3: Password hashing and administrator bootstrap

**Files:**
- Create: `src/modules/auth/password.ts`
- Create: `src/modules/auth/password.test.ts`
- Create: `src/modules/auth/bootstrap-admin.ts`
- Create: `src/modules/auth/bootstrap-admin.integration.test.ts`
- Create: `scripts/bootstrap-admin.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `env.ADMIN_USERNAME`, `env.ADMIN_PASSWORD`, `prisma`.
- Produces: `hashPassword(password: string): Promise<string>`; `verifyPassword(password: string, encodedHash: string): Promise<boolean>`; `ensureAdmin(input: { username: string; password: string; name: string }): Promise<{ id: string; created: boolean }>`.

- [ ] **Step 1: Write failing password and bootstrap tests**

Assert that identical passwords receive different encoded hashes, valid verification succeeds, invalid verification returns false, malformed hashes return false, and plaintext is absent from the encoded value. In the integration test, call `ensureAdmin` twice and assert exactly one `ADMIN` user exists and the second result has `created: false`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/modules/auth/password.test.ts && npm run test:integration -- src/modules/auth/bootstrap-admin.integration.test.ts`

Expected: FAIL because the auth helpers do not exist.

- [ ] **Step 3: Implement password hashing**

Implement the interface with Node.js `crypto.scrypt`, a new 16-byte random salt per password, explicit work parameters embedded in the encoded value, and `timingSafeEqual` for verification. Enforce passwords from 10 to 128 characters at the service boundary.

- [ ] **Step 4: Implement idempotent administrator bootstrap**

Normalize usernames by trimming and lowercasing. Create the single administrator only when none exists; if an administrator already exists, do not silently replace its password. Make `npm run bootstrap:admin` invoke `scripts/bootstrap-admin.ts` and never log the password.

- [ ] **Step 5: Run tests and the bootstrap command**

Run: `npm test -- src/modules/auth/password.test.ts && npm run test:integration -- src/modules/auth/bootstrap-admin.integration.test.ts && npm run bootstrap:admin`

Expected: tests pass; the command reports that the administrator exists or was created without displaying credentials.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth scripts/bootstrap-admin.ts package.json package-lock.json
git commit -m "feat: bootstrap secure administrator account"
```

### Task 4: Credential authentication and database-backed sessions

**Files:**
- Create: `src/modules/auth/auth-errors.ts`
- Create: `src/modules/auth/auth-service.ts`
- Create: `src/modules/auth/auth-service.integration.test.ts`
- Create: `src/modules/auth/session-repository.ts`
- Create: `src/modules/auth/session-repository.integration.test.ts`
- Create: `src/modules/auth/session-cookie.ts`
- Create: `src/modules/auth/session-cookie.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `prisma`, request cookie value.
- Produces: `authenticateCredentials(input: { username: string; password: string }): Promise<AuthenticatedUser>`; `createSession(userId: string): Promise<{ token: string; expiresAt: Date }>`; `resolveSession(token: string): Promise<AuthenticatedUser | null>`; `revokeSession(token: string): Promise<void>`; `buildSessionCookie(token: string, expiresAt: Date, production: boolean): CookieOptions`.

- [ ] **Step 1: Write failing authentication tests**

Cover successful `ADMIN` and `AGENT` authentication, the same `INVALID_CREDENTIALS` result for unknown username and wrong password, and `ACCOUNT_DISABLED` for a valid disabled user. Assert that request-like objects containing forged `role`, `userId`, and `agentId` do not affect the returned database user.

- [ ] **Step 2: Write failing session tests**

Assert that the returned raw token is at least 32 random bytes, the database stores only its SHA-256 hash, valid unexpired sessions resolve, revoked/expired/malformed/unknown tokens return null, and disabling the linked user makes a previously valid token resolve to null. Assert all cookie flags from Review Focus in production mode.

- [ ] **Step 3: Run tests to verify RED**

Run: `npm test -- src/modules/auth/session-cookie.test.ts && npm run test:integration -- src/modules/auth/auth-service.integration.test.ts src/modules/auth/session-repository.integration.test.ts`

Expected: FAIL because the services do not exist.

- [ ] **Step 4: Implement credential authentication**

Normalize the username exactly as bootstrap does, always perform a password-hash verification path for unknown usernames using a fixed dummy hash, and expose typed error codes without exposing whether an account exists.

- [ ] **Step 5: Implement opaque sessions and cookie options**

Create a cryptographically random token, store its SHA-256 hash with a seven-day expiry, and look up the active user on every resolution. Revoke by hash. `buildSessionCookie` must use name `campus_sweep_session`, `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` only in production.

- [ ] **Step 6: Run authentication and session tests**

Run: `npm test -- src/modules/auth/session-cookie.test.ts && npm run test:integration -- src/modules/auth/auth-service.integration.test.ts src/modules/auth/session-repository.integration.test.ts`

Expected: all tests pass, including disabled-user invalidation and generic credentials errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth
git commit -m "feat: add database-backed authentication sessions"
```

### Task 5: Authentication Route Handlers and server guards

**Files:**
- Create: `src/lib/http/api-error.ts`
- Create: `src/lib/http/api-response.ts`
- Create: `src/lib/http/require-same-origin.ts`
- Create: `src/lib/http/require-same-origin.test.ts`
- Create: `src/modules/auth/auth-schema.ts`
- Create: `src/modules/auth/current-user.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Create: `src/app/api/auth/auth-routes.integration.test.ts`
- Create: `src/app/(protected)/layout.tsx`
- Create: `src/app/(protected)/admin/page.tsx`
- Create: `src/app/(protected)/app/schools/page.tsx`
- Create: `src/modules/auth/protected-layout.integration.test.tsx`

**Interfaces:**
- Consumes: Task 4 auth/session functions and Next.js `cookies()`.
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; `requireUser(): Promise<AuthenticatedUser>`; `requireRole(role: UserRole): Promise<AuthenticatedUser>`.

- [ ] **Step 1: Write failing Route Handler tests**

Assert login input validation, 200 plus cookie on success, 401 with `账号或密码错误`, 403 with `账号已停用，请联系管理员`, logout revocation plus cookie clearing, and `/api/auth/me` returning only `id`, `name`, `username`, and `role`. Include bodies with forged identity fields and assert they are rejected. Add same-origin tests that accept a matching `Origin` and reject a foreign or malformed `Origin` on both POST routes.

- [ ] **Step 2: Write failing protected-layout tests**

Assert unauthenticated access redirects to `/login`, an agent cannot render `/admin`, an administrator cannot accidentally enter the agent school flow, and a disabled user with an existing session is redirected and has the cookie cleared.

- [ ] **Step 3: Run tests to verify RED**

Run: `npm run test:integration -- src/app/api/auth/auth-routes.integration.test.ts src/modules/auth/protected-layout.integration.test.tsx`

Expected: FAIL because routes, guards, and protected layouts do not exist.

- [ ] **Step 4: Implement schemas and shared API errors**

Validate login as `{ username: string; password: string }` with a strict schema: reject identity-like extras with `400 VALIDATION_ERROR`. Implement the shared JSON error envelope from Global Constraints without returning stack traces. Implement `requireSameOrigin(request: Request): void` and call it before processing login or logout.

- [ ] **Step 5: Implement login, logout, current-user routes, and guards**

Set or clear the cookie only through `session-cookie.ts`. `requireUser` resolves the cookie-backed session. `requireRole` returns 403 for API use and the protected layouts redirect authenticated users to their role's home page.

- [ ] **Step 6: Run route and guard tests**

Run: `npm run test:integration -- src/app/api/auth/auth-routes.integration.test.ts src/modules/auth/protected-layout.integration.test.tsx`

Expected: all tests pass with the exact Chinese messages and status codes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/http src/modules/auth src/app/api/auth src/app/\(protected\)
git commit -m "feat: protect application routes by session and role"
```

### Task 6: Shared login page and authenticated shells

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/modules/auth/login-form.tsx`
- Create: `src/modules/auth/login-form.test.tsx`
- Create: `src/components/identity-menu.tsx`
- Create: `src/components/identity-menu.test.tsx`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/admin-shell.tsx`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/auth.spec.ts`
- Modify: `src/app/(protected)/admin/page.tsx`
- Modify: `src/app/(protected)/app/schools/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 5 Route Handlers and protected pages.
- Produces: accessible shared login form; administrator shell; agent mobile shell; identity menu whose sole account action is `退出登录`.

- [ ] **Step 1: Write failing component tests**

Assert the login page has only username, password, password visibility toggle, and submit controls; it has no registration, tenant, team, plan, or self-service password-reset controls. Assert loading disables duplicate submit, generic and disabled errors render correctly, and the identity menu displays current name/role with only `退出登录`.

- [ ] **Step 2: Run component tests to verify RED**

Run: `npm test -- src/modules/auth/login-form.test.tsx src/components/identity-menu.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement the login and shell components**

Match the frozen prototype's visual hierarchy without copying demo state. Use semantic labels, visible keyboard focus, 48px minimum primary targets, `aria-live` for login errors, and server-provided identity in the protected shells.

- [ ] **Step 4: Run component tests**

Run: `npm test -- src/modules/auth/login-form.test.tsx src/components/identity-menu.test.tsx`

Expected: all component tests pass.

- [ ] **Step 5: Write the failing authentication E2E test**

In `e2e/fixtures/auth.ts`, create an isolated active test agent directly through the password and Prisma helpers, and delete only that fixture's sessions and user during teardown. In `e2e/auth.spec.ts`, cover administrator login to `/admin`, agent login to `/app/schools`, wrong-password messaging, password visibility, logout back to `/login`, direct protected URL redirect, and a mobile viewport confirming the primary controls are at least 48px high.

- [ ] **Step 6: Run E2E to verify RED, then wire missing behavior**

Run: `npm run test:e2e -- e2e/auth.spec.ts`

Expected before wiring: at least one flow fails. Connect form submission, role destination, menu logout, and protected redirects until the test passes.

- [ ] **Step 7: Run E2E and production checks**

Run: `npm run test:e2e -- e2e/auth.spec.ts && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/login src/app/\(protected\) src/modules/auth src/components src/app/globals.css e2e/fixtures/auth.ts e2e/auth.spec.ts
git commit -m "feat: add shared login and authenticated shells"
```

### Task 7: Continuous verification and developer runbook

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/development.md`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: all Tasks 1–6 scripts.
- Produces: one documented local setup path and one CI quality gate for install, database migration, lint, typecheck, unit/integration tests, build, and Playwright.

- [ ] **Step 1: Write the runbook acceptance checklist**

Document exact commands from a clean checkout: copy `.env.example`, start PostgreSQL, install locked dependencies with `npm ci`, apply migrations, bootstrap the administrator, start the app, and run each test class. Include Windows PowerShell-compatible commands because the current workspace runs on Windows.

- [ ] **Step 2: Add the CI workflow**

Use Node.js 24 and a PostgreSQL 18 service. Run `npm ci`, Prisma generation/migration, lint, typecheck, unit tests, integration tests, production build, Playwright browser installation, and E2E tests. Inject only disposable CI secrets.

- [ ] **Step 3: Execute the complete local verification**

Run: `npm ci && npm run db:generate && npm run db:migrate:deploy && npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build && npm run test:e2e`

Expected: every command exits 0; no test is skipped because a required database or browser is missing.

- [ ] **Step 4: Run the frozen prototype regression suite**

Run: `node --test tests/*.test.mjs` and `pwsh -NoProfile -File tests/prototype-contract.ps1`

Expected: all frozen-prototype tests still pass. Use PowerShell 7 (`pwsh`) because Windows PowerShell 5.1 misdecodes the UTF-8 Chinese assertions in this existing script.

- [ ] **Step 5: Manually inspect the right-side preview**

Open `/login`, sign in once as the bootstrapped administrator and once as a test agent, confirm the correct role destinations and logout behavior, and verify the mobile layout at 390px width.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml docs/development.md README.md package.json package-lock.json
git commit -m "chore: add application verification pipeline"
```
