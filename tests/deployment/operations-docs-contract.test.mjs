import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bash = platform() === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
const bashPath = (value) => platform() === "win32" ? value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/") : value;

test("clean-server acceptance validates the immutable deployment and repeat safety", async () => {
  const script = await read("ops/server/clean-server-acceptance.sh");
  const acceptance = bashPath(`${repoRoot}/ops/server/clean-server-acceptance.sh`);
  for (const args of [
    ["--base-url", "http://example.test", "--expected-commit", "a".repeat(40), "--phase", "first"],
    ["--base-url", "https://example.test", "--expected-commit", "not-a-commit", "--phase", "first"],
    ["--base-url", "https://example.test", "--expected-commit", "a".repeat(40), "--phase", "unknown"],
  ]) {
    assert.notEqual(spawnSync(bash, [acceptance, ...args], { encoding: "utf8" }).status, 0, args.join(" "));
  }

  assert.match(script, /--base-url/);
  assert.match(script, /https:\/\//);
  assert.match(script, /--expected-commit/);
  assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(script, /first\|repeat/);
  assert.match(script, /org\.opencontainers\.image\.revision/);
  assert.match(script, /State\.Health/);
  assert.match(script, /Strict-Transport-Security/);
  assert.match(script, /campus-sweep_campus_sweep_pgdata/);
  assert.match(script, /acceptance-evidence\/first\.json/);
  assert.match(script, /latestRestoreReport/);
  assert.match(script, /"status":"success"/);
  assert.match(script, /SweepRecord/);
  assert.match(script, /SweepAudit/);
  assert.doesNotMatch(script, /INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM/i);
});

test("operator documents cover independent backup, restore, and clean-server steps", async () => {
  const [backupRunbook, acceptanceRunbook, readme, development, workflow] = await Promise.all([
    read("docs/operations/backup-and-recovery.md"),
    read("docs/operations/clean-server-acceptance.md"),
    read("README.md"),
    read("docs/development.md"),
    read(".github/workflows/ci.yml"),
  ]);
  for (const phrase of [
    "./ops/server/backup.sh --reason manual",
    "./ops/server/backup-status.sh --json",
    "setup-backup-client.ps1",
    "pull-backups.ps1",
    "verify-backup.ps1",
    "disaster-recovery",
    "--confirm-empty-server",
    "Git 仓库、备份文件和恢复密钥",
    "SSH",
  ]) {
    assert.match(backupRunbook, new RegExp(phrase.replaceAll(".", "\\.")));
  }
  assert.match(acceptanceRunbook, /clean-server-acceptance\.sh/);
  assert.match(acceptanceRunbook, /验收-/);
  assert.match(acceptanceRunbook, /冲突/);
  assert.match(readme, /backup-and-recovery/);
  assert.match(development, /backup-and-recovery/);
  assert.match(workflow, /find ops -name '\*\.sh'/);
  assert.match(workflow, /test:backup:windows/);
});
