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
