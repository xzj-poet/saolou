# Backup, Recovery, and Clean-Server Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-independent daily encrypted PostgreSQL backups, Windows offsite pull and retention, real isolated restore verification, and a repeatable clean Ubuntu 24.04 deployment acceptance flow.

**Architecture:** The production server creates atomic encrypted backup sets and retains seven days; a Windows client pulls complete sets over SSH and retains thirty days. Restore verification sends an offsite copy back to an isolated PostgreSQL 18 container, compares a non-sensitive manifest, and destroys all temporary resources. Existing Docker Compose deployment remains the production entry point and installs an idempotent systemd timer.

**Tech Stack:** Bash, PowerShell 7/Windows PowerShell 5.1-compatible syntax, OpenSSH, OpenSSL, Docker Compose v2, PostgreSQL 18, Node.js 24 built-in test runner

**Spec:** `docs/superpowers/specs/2026-10-05-backup-recovery-deployment-design.md`

## Global Constraints

- Production server is Ubuntu 24.04 with Docker Engine and Docker Compose v2.
- The Windows administrator computer uses OpenSSH key authentication and must not store a plaintext SSH password.
- Server backup retention is 7 days; Windows offsite retention is 30 days; both locations always keep at least one valid set.
- Backup timestamps and age comparisons use UTC.
- A complete set is exactly `<stem>.dump.enc`, `<stem>.manifest.json`, and `<stem>.dump.enc.sha256`; the manifest is published last and is the readiness marker.
- Backup encryption uses a dedicated `BACKUP_ENCRYPTION_PASSWORD`, OpenSSL AES-256-CBC with a random salt, PBKDF2-HMAC-SHA-256, and 200,000 iterations; it never reuses database or administrator credentials.
- Backup directories use mode `0700`; backup-set files, state files, restore reports, and secret configuration use mode `0600`.
- Backup, environment, secret, state, incoming, quarantine, and restore-report files must remain untracked by Git.
- Restore verification must never attach, replace, or write to the production PostgreSQL container or `campus_sweep_pgdata` volume.
- Do not add object storage, email, SMS, a new administration page, or a cloud-vendor API.
- New behavior is developed test-first and must preserve the existing Node 24, PostgreSQL 18, Prisma, unit, integration, deployment, and Playwright gates.

## Review Focus

- A business write committed during backup must not make the manifest counts disagree with the dump; Task 1 uses one exported repeatable-read snapshot and Task 3 tests a concurrent write.
- A malicious or malformed stem containing separators or shell metacharacters must be rejected before any file access; Task 1 behavior tests cover traversal and metacharacters.
- A killed restore command must still remove the temporary container, volume, upload directory, and decrypted stream; Task 3 tests signal/error cleanup.
- A Windows task started twice must not download, quarantine, or prune the same set concurrently; Task 4 tests the named mutex and idempotent state update.
- A clean-server repeat deployment with existing data must preserve the original administrator password and row counts; Task 6 adds an acceptance script and Task 7 executes it twice.

---

### Task 1: Atomic encrypted server backup sets

**Files:**
- Create: `ops/server/backup-lib.sh`
- Create: `ops/server/backup.sh`
- Create: `tests/deployment/backup-behavior.test.mjs`
- Modify: `.gitignore`
- Modify: `tests/deployment/deployment-contract.test.mjs`

**Interfaces:**
- Produces shell library functions `require_backup_environment`, `validate_backup_stem`, `open_backup_snapshot`, `list_complete_backup_stems`, `publish_backup_set`, and `prune_backup_sets` in `ops/server/backup-lib.sh`.
- Produces command `./ops/server/backup.sh --reason <scheduled|manual|pre-deploy>`.
- Consumes `.env.production` values `POSTGRES_DB`, `POSTGRES_USER`, and `BACKUP_ENCRYPTION_PASSWORD`.
- Produces a complete set under `${BACKUP_DIR:-<repo>/backups}` named `campus-sweep-<UTC basic timestamp>.{dump.enc,manifest.json,dump.enc.sha256}`.
- Manifest schema is `{ formatVersion: 1, createdAt, reason, database, migrationCount, rowCounts, encryptedSha256 }`; `rowCounts` contains `User`, `School`, `Building`, `Dormitory`, `SweepRecord`, `SweepAudit`, and `Session` integer values.

- [ ] **Step 1: Write failing behavior and deployment contract tests**

In `backup-behavior.test.mjs`, construct an isolated temporary repository and a fake `PATH` for `docker`, `openssl`, `sha256sum`, `df`, and `flock`. Cover `rejects traversal and metacharacter stems`, `publishes manifest last`, `does not publish after dump or encryption failure`, `keeps existing backups after failure`, `uses stem UTC time instead of mtime for seven-day pruning`, `keeps newest set beyond seven-day pruning`, `never deletes the final valid set`, `ignores incomplete and unrelated files`, `refuses available bytes below max of twice database size and 512 MiB`, `accepts that exact boundary`, and `serializes competing runs`. Assert logs never contain the supplied encryption sentinel.

Extend `deployment-contract.test.mjs` to require all three backup filenames, PBKDF2, an exclusive lock, strict mode, UTC timestamps, manifest-last publication, and exact-path cleanup guards.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/deployment/backup-behavior.test.mjs tests/deployment/deployment-contract.test.mjs`

Expected: FAIL because the server backup library and command do not exist.

- [ ] **Step 3: Implement the minimal backup pipeline**

Implement `backup.sh` with `set -Eeuo pipefail`, canonical repository/backup paths, an exclusive `flock`, and a free-space requirement of `max(pg_database_size * 2, 512 MiB)`. `open_backup_snapshot` keeps one read-only repeatable-read `psql` transaction open, exports its snapshot ID, and returns migration/key-table counts from that same snapshot; `pg_dump --format=custom --compress=gzip:6 --snapshot=<id>` consumes it before the transaction closes. Pipe the dump through OpenSSL `enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256`, generate SHA-256, and build the manifest from the captured snapshot counts. Write only hidden temporary files until every stage succeeds, rename the dump and checksum first, then rename the manifest last. Traps must terminate the snapshot session on every exit. Pruning uses the validated UTC timestamp in each stem, never filesystem mtime.

Implement pruning through validated stems and resolved paths only. Add `backups/`, Windows state, incoming sets, quarantine, and restore reports to `.gitignore` without ignoring tracked scripts or documentation.

- [ ] **Step 4: Verify focused tests GREEN**

Run: `node --test tests/deployment/backup-behavior.test.mjs tests/deployment/deployment-contract.test.mjs`

Expected: all backup behavior and deployment contract tests PASS, with no files outside the test backup directory changed.

- [ ] **Step 5: Commit**

```bash
git add .gitignore ops/server/backup-lib.sh ops/server/backup.sh tests/deployment/backup-behavior.test.mjs tests/deployment/deployment-contract.test.mjs
git commit -m "feat: create atomic encrypted database backups"
```

### Task 2: Production configuration, deployment backup reuse, timer, and status

**Files:**
- Create: `ops/server/install-backup-timer.sh`
- Create: `ops/server/backup-status.sh`
- Create: `ops/systemd/campus-sweep-backup.service.in`
- Create: `ops/systemd/campus-sweep-backup.timer`
- Modify: `deploy.sh`
- Modify: `.env.example`
- Modify: `tests/deployment/deployment-contract.test.mjs`
- Modify: `tests/deployment/backup-behavior.test.mjs`

**Interfaces:**
- Extends `.env.production` with generated `BACKUP_ENCRYPTION_PASSWORD` and optional `BACKUP_DIR`; existing files receive missing values without rotating any existing credential.
- Produces idempotent `./ops/server/install-backup-timer.sh`, installing `campus-sweep-backup.service` for the invoking deployment user and a timer with `OnCalendar=*-*-* 03:17:00 UTC`, `RandomizedDelaySec=30m`, and `Persistent=true`.
- Produces `./ops/server/backup-status.sh [--json]`, reporting last complete backup, complete-set count, age, configured retention, free bytes, timer state, and latest restore report without exposing secrets.
- Changes `deploy.sh` to call `backup.sh --reason pre-deploy` before migration when an existing database container is present, then install/update the timer only after application health succeeds.

- [ ] **Step 1: Write failing deployment and idempotency tests**

Add assertions that a first deploy generates a distinct backup secret with mode `0600`; upgrade preserves it; an existing database cannot migrate after a failed pre-deploy backup; timer installation renders an absolute, shell-escaped working directory and correct user; repeated installation produces identical units; status distinguishes fresh, overdue (>48 hours), absent, and corrupt sets; and logs redact the secret sentinel.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/deployment/deployment-contract.test.mjs tests/deployment/backup-behavior.test.mjs`

Expected: FAIL because deployment still uses the former plain `pre-deploy-*.sql.gz` path and no timer/status commands exist.

- [ ] **Step 3: Integrate production configuration and operations**

Generate the backup secret with the existing `random_secret` helper, append missing backup settings through the existing secure temporary-env replacement path, and remove the old inline `pg_dump | gzip` implementation. Render systemd units to temporary files before privileged installation; use `sudo` only for unit installation/enablement and fail with a clear command when privilege elevation is unavailable. Keep backup creation separate from application availability: scheduled failures never stop the app, while pre-deploy failures stop migration.

- [ ] **Step 4: Verify focused and full deployment tests**

Run: `npm run test:deployment`

Expected: all deployment tests PASS; contracts contain no provider-specific service or credential.

- [ ] **Step 5: Commit**

```bash
git add deploy.sh .env.example ops/server/install-backup-timer.sh ops/server/backup-status.sh ops/systemd tests/deployment
git commit -m "feat: schedule and report production backups"
```

### Task 3: Isolated restore verification and disaster-recovery guardrails

**Files:**
- Create: `ops/server/restore-backup.sh`
- Create: `ops/server/verify-restored-data.sh`
- Create: `tests/deployment/backup-restore.integration.test.mjs`
- Create: `tests/deployment/fixtures/backup-compose.yaml`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/deployment/deployment-contract.test.mjs`

**Interfaces:**
- Produces `./ops/server/restore-backup.sh verify --backup <absolute .dump.enc path> [--report <path>]`.
- Produces `./ops/server/restore-backup.sh disaster-recovery --backup <absolute .dump.enc path> --confirm-empty-server` and refuses the mode without the exact confirmation flag.
- Consumes the adjacent `.manifest.json` and `.dump.enc.sha256`; requires the stem and all paths to pass Task 1 validation.
- Produces a JSON report `{ formatVersion: 1, mode, backupStem, startedAt, finishedAt, status, checks }` with no secrets or row data.
- Produces package script `test:backup:integration` that owns and cleans its Docker Compose project in `finally`/shell traps.

- [ ] **Step 1: Write failing guardrail and round-trip tests**

Cover `rejects checksum mismatch before decrypting`, `rejects wrong key`, `rejects missing manifest`, `rejects production project/container/volume names`, `requires explicit disaster recovery confirmation`, `restores a seeded PostgreSQL 18 archive`, `keeps dump and manifest counts on one snapshot during a concurrent committed write`, `matches migration and all manifest counts`, `detects broken sweep references`, `cleans resources after success`, `cleans resources after pg_restore failure`, and `cleans resources after TERM`. Assert the source database counts and volume identity do not change.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:backup:integration`

Expected: FAIL because restore commands, fixture Compose file, and package script do not exist.

- [ ] **Step 3: Implement isolated verification and guarded recovery**

For `verify`, generate a cryptographically random Compose project suffix; start a PostgreSQL 18 container with no published port and a unique temporary volume; stream OpenSSL decryption into `pg_restore`; then run `verify-restored-data.sh` inside the network. Install traps before creating any resource and delete the container, network, volume, upload directory, and decrypted stream on every exit/signal.

For `disaster-recovery`, first reject any existing production database container or `campus_sweep_pgdata` volume, create the production database only after the confirmation flag, restore, then run migrations/provisioning through the existing Compose services. Never implement an in-place overwrite path.

- [ ] **Step 4: Verify round trip, contracts, and unchanged source**

Run: `npm run test:backup:integration && npm run test:deployment`

Expected: backup restores into an isolated PostgreSQL 18 instance, all manifest checks PASS, source identity/counts remain unchanged, and Docker has no test resources after the command.

- [ ] **Step 5: Commit**

```bash
git add ops/server/restore-backup.sh ops/server/verify-restored-data.sh tests/deployment package.json .github/workflows/ci.yml
git commit -m "feat: verify backups with isolated restores"
```

### Task 4: Windows offsite backup client and retention

**Files:**
- Create: `ops/windows/CampusSweepBackup.psm1`
- Create: `ops/windows/setup-backup-client.ps1`
- Create: `ops/windows/pull-backups.ps1`
- Create: `ops/windows/install-backup-task.ps1`
- Create: `tests/deployment/windows-backup-client.test.ps1`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/deployment/deployment-contract.test.mjs`

**Interfaces:**
- Module exports `Test-BackupStem`, `Get-CompleteBackupSet`, `Test-BackupSet`, `Sync-BackupSets`, `Remove-ExpiredBackupSets`, `Read-BackupClientState`, and `Write-BackupClientState`.
- `setup-backup-client.ps1` creates a per-user JSON config without secrets and stores the recovery key with Windows DPAPI `CurrentUser`; it never accepts or saves an SSH password.
- `pull-backups.ps1` uses `ssh` for the remote complete-set listing and `sftp` batch mode for transfer, a per-user named mutex, `.partial` destinations, SHA-256 validation, atomic publication, quarantine, 30-day pruning, and JSON state update.
- `install-backup-task.ps1` creates an idempotent current-user Task Scheduler task triggered at logon and daily, with “start when available” enabled.
- Produces package script `test:backup:windows` running `windows-backup-client.test.ps1`; Task 5 extends it with the restore-client suite.

- [ ] **Step 1: Write failing PowerShell behavior tests**

Use temporary local source/destination directories and injected listing/download scriptblocks. Cover traversal/metacharacter rejection, complete-trio discovery, manifest-last readiness, valid download, partial transfer retry, checksum quarantine, duplicate-run mutex, already-valid skip, listing snapshot before retention, thirty-day pruning, last-valid-set preservation, state atomicity, secret redaction, overdue detection after 48 hours, and repeated task installation command stability.

- [ ] **Step 2: Run tests and verify RED**

Run: `pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1`

Expected: FAIL because the module and Windows commands do not exist.

- [ ] **Step 3: Implement the Windows client**

Keep transport orchestration in `pull-backups.ps1` and pure validation/retention/state logic in the module. Use `Get-FileHash -Algorithm SHA256`, same-directory temporary files, JSON written through a temporary file and atomic move, and `System.Windows.Forms.NotifyIcon` only when an interactive session exists; otherwise emit a warning and nonzero exit. Store config/state under `%LOCALAPPDATA%\CampusSweepBackup` and backup data under the user-selected directory.

- [ ] **Step 4: Verify PowerShell and deployment contracts**

Run: `pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1 && npm run test:deployment`

Expected: all PowerShell assertions and deployment contracts PASS on Windows and GitHub Actions; no DPAPI blob or test backup remains in the repository.

- [ ] **Step 5: Commit**

```bash
git add ops/windows tests/deployment/windows-backup-client.test.ps1 package.json .github/workflows/ci.yml tests/deployment/deployment-contract.test.mjs
git commit -m "feat: pull backups to Windows offsite storage"
```

### Task 5: Windows-initiated monthly restore drill

**Files:**
- Create: `ops/windows/verify-backup.ps1`
- Create: `tests/deployment/windows-restore-client.test.ps1`
- Modify: `ops/windows/CampusSweepBackup.psm1`
- Modify: `ops/windows/install-backup-task.ps1`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/deployment/deployment-contract.test.mjs`

**Interfaces:**
- Produces `verify-backup.ps1 [-Stem <validated stem>]`; omission selects the newest locally valid set.
- Uploads one complete trio to a random `backups/incoming/<id>` directory through SFTP, invokes server `restore-backup.sh verify`, downloads the JSON report, and removes the incoming directory through a fixed remote command that receives only the validated random ID.
- Extends state with `lastRestoreAttemptAt`, `lastRestoreSuccessAt`, `lastRestoreStem`, and `lastRestoreReport`.
- Extends Task Scheduler installation with a monthly current-user restore task, “start when available”, that runs only when a valid local set exists.
- Extends `test:backup:windows` to run both PowerShell suites and keeps CI pointed at that one command.

- [ ] **Step 1: Write failing client orchestration tests**

Inject fake SSH/SFTP transports and cover newest-set selection, explicit validated selection, incomplete-set rejection, random incoming directory, upload-before-execute ordering, report schema/status validation, remote cleanup after success and failure, state update only after a successful report, overdue monthly state, and command-injection rejection.

- [ ] **Step 2: Run tests and verify RED**

Run: `pwsh -NoProfile -File tests/deployment/windows-restore-client.test.ps1`

Expected: FAIL because no Windows restore drill command exists.

- [ ] **Step 3: Implement the monthly drill client**

Use module validation for all stems and local sets. Pass remote paths through an SFTP batch file rather than interpolating arbitrary user input. The only SSH command parameters are fixed script paths, a generated identifier matching `^[a-f0-9]{32}$`, and a validated backup stem. Always attempt remote incoming-directory cleanup in `finally`; never send the backup encryption password over SSH because the server reads its protected `.env.production`.

- [ ] **Step 4: Verify all Windows client tests**

Run: `pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1 && pwsh -NoProfile -File tests/deployment/windows-restore-client.test.ps1`

Expected: all tests PASS, including failed-transfer cleanup and no state false-positive.

- [ ] **Step 5: Commit**

```bash
git add ops/windows tests/deployment/windows-restore-client.test.ps1 tests/deployment/deployment-contract.test.mjs package.json .github/workflows/ci.yml
git commit -m "feat: automate monthly offsite restore drills"
```

### Task 6: Clean-server acceptance flow and operator runbook

**Files:**
- Create: `ops/server/clean-server-acceptance.sh`
- Create: `docs/operations/backup-and-recovery.md`
- Create: `docs/operations/clean-server-acceptance.md`
- Create: `tests/deployment/operations-docs-contract.test.mjs`
- Modify: `README.md`
- Modify: `docs/development.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces `./ops/server/clean-server-acceptance.sh --base-url <https-url> --expected-commit <sha> --phase <first|repeat>`.
- The command records only non-secret evidence: checked commit, container/image health, HTTPS status/security headers, database volume identity, schema migration count, and critical table counts before/after repeat deployment.
- Produces a manual business checklist for login, matrix read, single save, batch save, conflict presentation, and administrator correction; fixture names are prefixed `验收-<UTC timestamp>` and are removed after acceptance.
- Produces end-user instructions for server setup, recovery-key custody, SSH key setup, Windows client setup, manual backup, status diagnosis, isolated drill, full disaster recovery, and renewal/migration to another provider.

- [ ] **Step 1: Write failing documentation and acceptance contracts**

Assert the acceptance command rejects HTTP URLs, non-SHA commits, unknown phases, mismatched running image labels, unhealthy services, missing HSTS, changed volume identity during repeat phase, lower row counts during repeat phase, and absent/failing recent restore reports. Assert the runbook contains every command and warning from the spec, including that backup files plus Git plus recovery key are sufficient for a new server.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/deployment/operations-docs-contract.test.mjs tests/deployment/deployment-contract.test.mjs`

Expected: FAIL because the acceptance command and runbooks do not exist.

- [ ] **Step 3: Implement acceptance evidence and documentation**

Have the acceptance script call existing Compose health checks, `curl`, `docker inspect`, read-only PostgreSQL queries, `backup-status.sh --json`, and the latest restore report. The script must not create business data automatically on a non-empty environment; keep business operations as an explicit operator checklist. Update CI to syntax-check every Bash script, run both PowerShell suites, run deployment contracts, and run the Docker restore integration.

- [ ] **Step 4: Verify documentation, CI contracts, and existing gates**

Run: `npm run test:deployment && pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1 && pwsh -NoProfile -File tests/deployment/windows-restore-client.test.ps1`

Expected: all operations contracts PASS and the documented commands exactly match tracked files and package scripts.

- [ ] **Step 5: Commit**

```bash
git add ops/server/clean-server-acceptance.sh docs/operations README.md docs/development.md tests/deployment/operations-docs-contract.test.mjs .github/workflows/ci.yml
git commit -m "docs: add clean-server recovery runbook"
```

### Task 7: Full local gate, remote CI, and real server acceptance

**Files:**
- Modify only if acceptance exposes a verified defect: files owned by Tasks 1–6 and their corresponding tests
- Do not commit: `.env.production`, backup sets, DPAPI state, SSH keys, server address, restore reports containing host identifiers, or acceptance credentials

**Interfaces:**
- Consumes every prior task and the existing application quality gates.
- Produces a clean Git branch, passing remote CI, one Windows offsite backup, one isolated restore report, and first/repeat clean-server acceptance evidence.

- [ ] **Step 1: Run the complete local quality gate with Node.js 24**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:deployment
npm run test:backup:integration
npm run test:e2e
pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1
pwsh -NoProfile -File tests/deployment/windows-restore-client.test.ps1
node --test tests/*.test.mjs
pwsh -NoProfile -File tests/prototype-contract.ps1
git diff --check <merge-base>...HEAD
```

Expected: every command exits `0`; only existing documented device-conditional Playwright skips remain; Docker test resources are absent afterward.

- [ ] **Step 2: Review the whole branch against the spec**

Build a whole-branch review package from the merge base and obtain one fresh review. Grade findings by user impact. Fix Critical/Important findings in one TDD pass; record Minor findings without expanding scope.

- [ ] **Step 3: Obtain explicit authorization before external changes**

Stop and request authorization to push the branch and to connect to the purchased server. Collect only the SSH user/host/key path, intended domain, and confirmation that the server can be reset for clean acceptance. Never request the private-key contents in chat.

- [ ] **Step 4: Push and require remote CI GREEN**

Push only the approved branch, attach a pull request if one is created, and wait for the GitHub workflow. Do not continue to production acceptance after a failing or cancelled workflow.

- [ ] **Step 5: Execute real clean-server and offsite acceptance**

On the approved Ubuntu 24.04 server, deploy the exact approved commit, run `clean-server-acceptance.sh` in `first` phase, configure the Windows client, generate/download one backup, initiate one restore drill from that Windows copy, run the deployment command a second time, then run acceptance in `repeat` phase. Complete the manual business checklist and remove its fixtures.

Expected: HTTPS and application health pass; volume identity is stable; table counts do not decrease; Windows checksum passes; isolated restore report is successful; no secret or backup is tracked; repeated deployment preserves the original administrator password and business data.

- [ ] **Step 6: Commit only acceptance-exposed fixes, then re-run affected and full gates**

Any fix must begin with a failing automated regression test. If no defect is exposed, create no empty “acceptance” commit. Record host-independent acceptance results in the operator checklist without server IP, domain secrets, usernames, or credentials.

## Final Delivery Gate

- [ ] Every task-specific test and the complete local gate pass.
- [ ] Whole-branch review has no unresolved Critical or Important finding.
- [ ] Worktree is clean and each implementation task has its own focused commit.
- [ ] Remote CI passes on the exact accepted commit.
- [ ] One real Windows offsite copy verifies successfully.
- [ ] One real isolated PostgreSQL 18 restore from that offsite copy passes all manifest checks.
- [ ] Clean Ubuntu 24.04 first and repeat deployment acceptance both pass.
- [ ] Only after all preceding checks may the system be described as production-ready.
