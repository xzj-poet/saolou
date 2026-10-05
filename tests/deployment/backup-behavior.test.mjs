import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";

function bashPath(value) {
  if (process.platform !== "win32") return value;
  return value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/");
}

function runLibrary(script, args = [], env = {}) {
  return spawnSync(bash, ["-lc", `source ./ops/server/backup-lib.sh; ${script}`, "backup-test", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function createBackupFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "campus-backup-run-"));
  const serverDirectory = path.join(root, "ops", "server");
  const binDirectory = path.join(root, "bin");
  const backupDirectory = path.join(root, "backups");
  await Promise.all([
    mkdir(serverDirectory, { recursive: true }),
    mkdir(binDirectory, { recursive: true }),
    mkdir(backupDirectory, { recursive: true }),
  ]);
  await Promise.all([
    cp(path.join(repoRoot, "ops", "server", "backup.sh"), path.join(serverDirectory, "backup.sh")),
    cp(path.join(repoRoot, "ops", "server", "backup-lib.sh"), path.join(serverDirectory, "backup-lib.sh")),
    writeFile(path.join(root, "compose.yaml"), "services: {}\n"),
    writeFile(path.join(root, ".env.production"), [
      "POSTGRES_DB=campus_sweep",
      "POSTGRES_USER=campus_sweep",
      "BACKUP_ENCRYPTION_PASSWORD=never-print-this-backup-secret",
      `BACKUP_DIR=${bashPath(backupDirectory)}`,
      "",
    ].join("\n")),
    writeFile(path.join(binDirectory, "docker"), `#!/usr/bin/env bash
if [ "$1 $2" = "compose version" ]; then exit 0; fi
case " $* " in
  *" psql "*)
    printf '%s\\n' '00000003-00000001-1' '1048576' '2' '1' '2' '3' '4' '5' '6' '7'
    sleep "\${FAKE_SNAPSHOT_SLEEP:-0}"
    ;;
  *" pg_dump "*)
    [ "\${FAKE_DUMP_FAIL:-0}" = 1 ] && exit 41
    sleep "\${FAKE_DUMP_DELAY:-0}"
    printf 'custom-dump'
    ;;
  *) exit 2 ;;
esac
`),
    writeFile(path.join(root, "fake-env.sh"), `openssl() {
  if [ "\${FAKE_OPENSSL_FAIL:-0}" = 1 ]; then return 42; fi
  command openssl "$@"
}
`),
    writeFile(path.join(binDirectory, "df"), "#!/usr/bin/env bash\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\nfixture 2097152 1 2097151 1%% /\\n'\n"),
  ]);
  if (process.platform === "win32") {
    await writeFile(path.join(binDirectory, "flock"), "#!/usr/bin/env bash\nmkdir .fake-flock-held 2>/dev/null\n");
  }
  for (const name of await readdir(binDirectory)) {
    await import("node:fs/promises").then(({ chmod }) => chmod(path.join(binDirectory, name), 0o755));
  }
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, backupDirectory, binDirectory };
}

function runBackup(fixture, env = {}) {
  return spawnSync(bash, [bashPath(path.join(fixture.root, "ops", "server", "backup.sh")), "--reason", "manual"], {
    cwd: fixture.root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bashPath(fixture.binDirectory)}:${process.env.PATH}`, BASH_ENV: bashPath(path.join(fixture.root, "fake-env.sh")), ...env },
    timeout: 10_000,
  });
}

async function createSet(directory, stem) {
  await Promise.all([
    writeFile(path.join(directory, `${stem}.dump.enc`), "encrypted"),
    writeFile(path.join(directory, `${stem}.dump.enc.sha256`), "hash  dump\n"),
    writeFile(path.join(directory, `${stem}.manifest.json`), "{}\n"),
  ]);
}

test("backup stems reject traversal and shell metacharacters", () => {
  for (const stem of ["../campus-sweep-20261005T010203Z", "campus-sweep-20261005T010203Z;id", "campus-sweep-99999999T999999Z", "other-20261005T010203Z"]) {
    const result = runLibrary('validate_backup_stem "$1"', [stem]);
    assert.notEqual(result.status, 0, stem);
  }
  assert.equal(runLibrary('validate_backup_stem "$1"', ["campus-sweep-20261005T010203Z"]).status, 0);
});
test("complete-set listing ignores incomplete and unrelated files", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-backup-list-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  await createSet(directory, "campus-sweep-20261005T010203Z");
  await writeFile(path.join(directory, "campus-sweep-20261005T020304Z.dump.enc"), "partial");
  await writeFile(path.join(directory, ".campus-sweep-20261005T030405Z.dump.enc.tmp"), "temporary");
  await writeFile(path.join(directory, "notes.txt"), "unrelated");

  const result = runLibrary('list_complete_backup_stems "$1"', [bashPath(directory)]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ["campus-sweep-20261005T010203Z"]);
});

test("publication never exposes a manifest for an incomplete set", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-backup-publish-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const stem = "campus-sweep-20261005T010203Z";
  const dump = path.join(directory, ".dump.tmp");
  const manifest = path.join(directory, ".manifest.tmp");
  await writeFile(dump, "encrypted");
  await writeFile(manifest, "{}\n");

  const result = runLibrary('publish_backup_set "$1" "$2" "$3" "$4" "$5"', [bashPath(directory), stem, bashPath(dump), bashPath(manifest), bashPath(path.join(directory, ".missing.sha"))]);
  assert.notEqual(result.status, 0, JSON.stringify(result));
  assert.doesNotMatch(result.stderr, /command not found|No such file or directory/);
  await assert.rejects(stat(path.join(directory, `${stem}.manifest.json`)));
});

test("retention uses the stem UTC timestamp instead of file mtime", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-backup-prune-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const oldStem = "campus-sweep-20260920T000000Z";
  const freshStem = "campus-sweep-20261004T000000Z";
  await createSet(directory, oldStem);
  await createSet(directory, freshStem);
  const misleadingMtime = new Date("2026-10-05T00:00:00Z");
  for (const suffix of ["dump.enc", "dump.enc.sha256", "manifest.json"]) {
    await utimes(path.join(directory, `${oldStem}.${suffix}`), misleadingMtime, misleadingMtime);
  }

  const nowEpoch = String(Date.parse("2026-10-05T12:00:00Z") / 1000);
  const result = runLibrary('prune_backup_sets "$1" "$2" 7', [bashPath(directory), nowEpoch]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(directory)).sort(), [
    `${freshStem}.dump.enc`,
    `${freshStem}.dump.enc.sha256`,
    `${freshStem}.manifest.json`,
  ]);
});

test("retention never deletes the final valid backup set", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-backup-last-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const stem = "campus-sweep-20260901T000000Z";
  await createSet(directory, stem);

  const nowEpoch = String(Date.parse("2026-10-05T12:00:00Z") / 1000);
  const result = runLibrary('prune_backup_sets "$1" "$2" 7', [bashPath(directory), nowEpoch]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readdir(directory)).length, 3);
});

test("free-space check requires the larger of twice database size and 512 MiB", () => {
  const mib512 = 512 * 1024 * 1024;
  assert.notEqual(runLibrary('require_backup_space "$1" "$2"', [String(300 * 1024 * 1024), String(600 * 1024 * 1024 - 1)]).status, 0);
  assert.equal(runLibrary('require_backup_space "$1" "$2"', [String(300 * 1024 * 1024), String(600 * 1024 * 1024)]).status, 0);
  assert.notEqual(runLibrary('require_backup_space "$1" "$2"', [String(1), String(mib512 - 1)]).status, 0);
  assert.equal(runLibrary('require_backup_space "$1" "$2"', [String(1), String(mib512)]).status, 0);
});

test("backup environment requires a dedicated non-empty encryption password", () => {
  const missing = runLibrary("require_backup_environment", [], { POSTGRES_DB: "campus_sweep", POSTGRES_USER: "owner", BACKUP_ENCRYPTION_PASSWORD: "" });
  assert.notEqual(missing.status, 0);
  const valid = runLibrary("require_backup_environment", [], { POSTGRES_DB: "campus_sweep", POSTGRES_USER: "owner", BACKUP_ENCRYPTION_PASSWORD: "backup-only-secret" });
  assert.equal(valid.status, 0, valid.stderr);
  assert.doesNotMatch(`${valid.stdout}${valid.stderr}`, /backup-only-secret/);
});

test("dump failure publishes nothing and preserves the existing valid set", async (t) => {
  const fixture = await createBackupFixture(t);
  const existingStem = "campus-sweep-20261004T010203Z";
  await createSet(fixture.backupDirectory, existingStem);

  const result = runBackup(fixture, { FAKE_DUMP_FAIL: "1" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /never-print-this-backup-secret/);
  assert.deepEqual((await readdir(fixture.backupDirectory)).filter((name) => !name.startsWith(".")).sort(), [
    `${existingStem}.dump.enc`,
    `${existingStem}.dump.enc.sha256`,
    `${existingStem}.manifest.json`,
  ]);
});

test("encryption failure publishes no ready manifest", async (t) => {
  const fixture = await createBackupFixture(t);
  const result = runBackup(fixture, { FAKE_OPENSSL_FAIL: "1" });
  assert.notEqual(result.status, 0, JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }));
  assert.equal((await readdir(fixture.backupDirectory)).some((name) => name.endsWith(".manifest.json")), false);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /never-print-this-backup-secret/);
});

test("exclusive lock rejects a competing backup", async (t) => {
  const fixture = await createBackupFixture(t);
  const child = spawn(bash, [bashPath(path.join(fixture.root, "ops", "server", "backup.sh")), "--reason", "manual"], {
    cwd: fixture.root,
    env: { ...process.env, PATH: `${bashPath(fixture.binDirectory)}:${process.env.PATH}`, BASH_ENV: bashPath(path.join(fixture.root, "fake-env.sh")), FAKE_DUMP_DELAY: "2" },
  });
  t.after(() => child.kill("SIGKILL"));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const competing = runBackup(fixture);
  assert.notEqual(competing.status, 0);
  assert.match(competing.stderr, /另一个备份任务正在运行/);
  await new Promise((resolve, reject) => {
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`first backup exited ${code}`)));
    child.once("error", reject);
  });
});

