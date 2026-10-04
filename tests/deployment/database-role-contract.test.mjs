import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("deployment separates owner migration credentials from runtime credentials", async () => {
  const [compose, deploy, prismaConfig] = await Promise.all([read("compose.yaml"), read("deploy.sh"), read("prisma.config.ts")]);
  const appBlock = compose.match(/^  app:[\s\S]*?(?=^  \w|^volumes:)/m)?.[0] ?? "";
  const provisionBlock = compose.match(/^  provision:[\s\S]*?(?=^  \w|^volumes:)/m)?.[0] ?? "";
  assert.match(appBlock, /DATABASE_URL:/);
  assert.doesNotMatch(appBlock, /DATABASE_ADMIN_URL/);
  assert.match(provisionBlock, /DATABASE_URL:/);
  assert.match(provisionBlock, /DATABASE_ADMIN_URL:/);
  assert.match(provisionBlock, /POSTGRES_APP_USER:/);
  assert.match(deploy, /POSTGRES_APP_PASSWORD/);
  assert.match(deploy, /DATABASE_ADMIN_URL/);
  assert.match(deploy, /campus_sweep_app/);
  assert.match(prismaConfig, /DATABASE_ADMIN_URL/);
});

test("role scripts provision idempotently and verify schema denial code", async () => {
  const [packageJson, provision, verify] = await Promise.all([read("package.json"), read("scripts/provision-app-role.ts"), read("scripts/verify-app-role.ts")]);
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts["db:provision:app"], "tsx scripts/provision-app-role.ts");
  assert.equal(scripts["db:verify:app-role"], "tsx scripts/verify-app-role.ts");
  assert.match(provision, /campus_sweep_app/);
  assert.match(provision, /ALTER DEFAULT PRIVILEGES/);
  assert.match(verify, /42501/);
  assert.match(verify, /CREATE TABLE/);
});

test("CI provisions and verifies the runtime database role", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  assert.match(workflow, /DATABASE_ADMIN_URL:/);
  assert.match(workflow, /POSTGRES_APP_USER: campus_sweep_app/);
  assert.match(workflow, /npm run db:provision:app/);
  assert.match(workflow, /npm run db:verify:app-role/);
});
