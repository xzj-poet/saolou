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
