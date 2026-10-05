import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("production deployment is pinned, persistent, and health checked", async () => {
  const [dockerfile, compose, caddyfile] = await Promise.all([
    read("Dockerfile"),
    read("compose.yaml"),
    read("Caddyfile"),
  ]);

  assert.match(dockerfile, /FROM node:24-alpine AS deps/);
  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /FROM node:24-alpine AS app/);
  assert.doesNotMatch(dockerfile, /:latest\b/);

  for (const service of ["db", "provision", "app", "caddy"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  }
  assert.match(compose, /postgres:18-alpine/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /campus_sweep_pgdata:/);
  assert.match(compose, /caddy_data:/);
  assert.match(compose, /\/api\/health/);
  assert.doesNotMatch(compose, /:latest\b/);
  assert.match(caddyfile, /reverse_proxy app:3000/);
  assert.doesNotMatch(compose.match(/^  app:[\s\S]*?(?=^  caddy:)/m)?.[0] ?? "", /DATABASE_ADMIN_URL/);
});

test("the one-command entry validates configuration and provisions the app", async () => {
  const [deploy, readme, packageJson] = await Promise.all([
    read("deploy.sh"),
    read("README.md"),
    read("package.json"),
  ]);

  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /\.env\.production/);
  assert.match(deploy, /docker compose/);
  assert.match(deploy, /config --quiet/);
  assert.match(deploy, /ps -a -q db/);
  assert.match(deploy, /run --rm provision/);
  assert.match(deploy, /up -d app caddy --no-deps/);
  assert.match(readme, /\.\/deploy\.sh/);
  assert.equal(JSON.parse(packageJson).scripts["test:deployment"], "node --test tests/deployment/*.test.mjs");
});

test("continuous verification uses Node 24 and PostgreSQL 18", async () => {
  const workflow = await read(".github/workflows/ci.yml");

  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /postgres:18-alpine/);
  for (const command of [
    "npm ci",
    "npm run db:generate",
    "npm run db:migrate:deploy",
    "npm run db:provision:app",
    "npm run db:verify:app-role",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "npm run test:integration",
    "npm run build",
    "npm run test:e2e",
    "npm run test:deployment",
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(" ", "\\s+")));
  }
});

test("production backups are atomic, encrypted, locked, and path constrained", async () => {
  const [backup, library, gitignore] = await Promise.all([
    read("ops/server/backup.sh"),
    read("ops/server/backup-lib.sh"),
    read(".gitignore"),
  ]);

  assert.match(backup, /set -Eeuo pipefail/);
  assert.match(backup, /flock/);
  assert.match(backup, /date -u/);
  assert.match(backup, /\.dump\.enc/);
  assert.match(backup, /\.manifest\.json/);
  assert.match(backup, /\.dump\.enc\.sha256/);
  assert.match(backup, /-aes-256-cbc/);
  assert.match(backup, /-pbkdf2/);
  assert.match(backup, /-iter 200000/);
  assert.match(backup, /--snapshot/);
  assert.match(library, /validate_backup_stem/);
  assert.match(library, /readlink -f/);
  assert.match(library, /manifest\.json/);
  assert.match(gitignore, /backups\//);
  assert.match(gitignore, /quarantine/);
  assert.match(gitignore, /restore-reports/);
});

test("deployment reuses encrypted backups and installs the daily timer after health", async () => {
  const [deploy, example, service, timer, status] = await Promise.all([
    read("deploy.sh"),
    read(".env.example"),
    read("ops/systemd/campus-sweep-backup.service.in"),
    read("ops/systemd/campus-sweep-backup.timer"),
    read("ops/server/backup-status.sh"),
  ]);
  assert.match(deploy, /BACKUP_ENCRYPTION_PASSWORD/);
  assert.match(deploy, /backup\.sh" --reason pre-deploy/);
  assert.doesNotMatch(deploy, /pg_dump[^\n]*gzip/);
  assert.ok(deploy.indexOf("install-backup-timer.sh") > deploy.indexOf("healthy"));
  assert.match(example, /BACKUP_ENCRYPTION_PASSWORD/);
  assert.match(service, /@DEPLOYMENT_USER@/);
  assert.match(service, /@WORKING_DIRECTORY@/);
  assert.match(timer, /OnCalendar=\*-\*-\* 03:17:00 UTC/);
  assert.match(timer, /RandomizedDelaySec=30m/);
  assert.match(timer, /Persistent=true/);
  assert.match(status, /--json/);
  assert.doesNotMatch(`${deploy}${service}${timer}${status}`, /amazon|aliyun|tencent|azure/i);
});

test("restore verification is isolated and CI exercises the PostgreSQL 18 round trip", async () => {
  const [restore, verify, fixture, workflow, packageJson] = await Promise.all([
    read("ops/server/restore-backup.sh"),
    read("ops/server/verify-restored-data.sh"),
    read("tests/deployment/fixtures/backup-compose.yaml"),
    read(".github/workflows/ci.yml"),
    read("package.json"),
  ]);
  assert.match(restore, /disaster-recovery/);
  assert.match(restore, /--confirm-empty-server/);
  assert.match(restore, /postgres:18-alpine/);
  assert.match(restore, /docker volume create/);
  assert.match(restore, /docker rm -f/);
  assert.match(restore, /docker volume rm -f/);
  assert.doesNotMatch(restore, /campus_sweep_pgdata:\/var\/lib\/postgresql\/data/);
  assert.match(verify, /SweepRecord/);
  assert.match(verify, /SweepAudit/);
  assert.match(fixture, /postgres:18-alpine/);
  assert.match(workflow, /npm run test:backup:integration/);
  assert.equal(JSON.parse(packageJson).scripts["test:backup:integration"], "node --test tests/deployment/backup-restore.integration.test.mjs");
});

test("Windows offsite client uses SSH, SFTP, DPAPI, and a mutex without a cloud vendor", async () => {
  const [module, setup, pull, restore, install, workflow, packageJson] = await Promise.all([
    read("ops/windows/CampusSweepBackup.psm1"),
    read("ops/windows/setup-backup-client.ps1"),
    read("ops/windows/pull-backups.ps1"),
    read("ops/windows/verify-backup.ps1"),
    read("ops/windows/install-backup-task.ps1"),
    read(".github/workflows/ci.yml"),
    read("package.json"),
  ]);
  for (const symbol of ["Test-BackupStem", "Get-CompleteBackupSet", "Test-BackupSet", "Sync-BackupSets", "Remove-ExpiredBackupSets", "Read-BackupClientState", "Write-BackupClientState", "Test-BackupRestoreOverdue"]) {
    assert.match(module, new RegExp(`function ${symbol}`));
  }
  assert.match(setup, /ConvertFrom-SecureString/);
  assert.match(pull, /\bssh\b/);
  assert.match(pull, /\bsftp\b/);
  assert.match(pull, /Enter-BackupMutex/);
  assert.match(install, /New-ScheduledTaskTrigger/);
  assert.match(install, /Campus Sweep Backup Restore Verification/);
  assert.match(install, /-WeeksInterval 4/);
  assert.match(install, /StartWhenAvailable/);
  assert.match(restore, /Get-CompleteBackupSet/);
  assert.match(restore, /incoming\/\$restoreId/);
  assert.match(restore, /\bsftp\b/);
  assert.match(restore, /restore-backup\.sh verify/);
  assert.match(restore, /finally/);
  assert.match(restore, /lastRestoreSuccessAt/);
  assert.match(workflow, /npm run test:backup:windows/);
  assert.equal(JSON.parse(packageJson).scripts["test:backup:windows"], "pwsh -NoProfile -File tests/deployment/windows-backup-client.test.ps1 && pwsh -NoProfile -File tests/deployment/windows-restore-client.test.ps1");
  assert.doesNotMatch(`${module}${setup}${pull}${restore}${install}`, /amazon|aliyun|tencent|azure/i);
});
