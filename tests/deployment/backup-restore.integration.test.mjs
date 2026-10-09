import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

function bashPath(value) {
  if (process.platform !== "win32") return value;
  return value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/");
}

async function executable(file, content) {
  await writeFile(file, content);
  await import("node:fs/promises").then(({ chmod }) => chmod(file, 0o755));
}

async function makeFixture(t, { fakeDocker = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "campus-restore-"));
  const server = path.join(root, "ops", "server");
  const backupDirectory = path.join(root, "backups");
  const bin = path.join(root, "bin");
  await Promise.all([mkdir(server, { recursive: true }), mkdir(backupDirectory), mkdir(bin)]);
  await Promise.all([
    cp(path.join(repoRoot, "ops", "server", "backup-lib.sh"), path.join(server, "backup-lib.sh")),
    cp(path.join(repoRoot, "ops", "server", "backup.sh"), path.join(server, "backup.sh")),
    cp(path.join(repoRoot, "ops", "server", "restore-backup.sh"), path.join(server, "restore-backup.sh")),
    cp(path.join(repoRoot, "ops", "server", "verify-restored-data.sh"), path.join(server, "verify-restored-data.sh")),
    cp(path.join(repoRoot, "tests", "deployment", "fixtures", "backup-compose.yaml"), path.join(root, "compose.yaml")),
  ]);
  const eventLog = path.join(root, "docker-events.log");
  if (fakeDocker) {
    await executable(path.join(bin, "docker"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [ "$1 $2" = "compose version" ]; then exit 0; fi
if [ "$1" = "volume" ] && [ "$2" = "inspect" ] && [ "\${FAKE_PRODUCTION_EXISTS:-0}" = 1 ]; then printf 'existing-volume\\n'; exit 0; fi
if [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then exit 1; fi
if [ "$1" = "volume" ] && [ "$2" = "create" ]; then printf '%s\\n' "$3"; exit 0; fi
if [ "$1" = "run" ]; then printf 'container-id\\n'; exit 0; fi
if [ "$1" = "inspect" ]; then printf 'true\\n'; exit 0; fi
if [ "$1" = "exec" ] && [[ " $* " == *" pg_isready "* ]]; then exit 0; fi
if [ "$1" = "exec" ] && [[ " $* " == *" pg_restore "* ]]; then cat >/dev/null; sleep "\${FAKE_PG_RESTORE_DELAY:-0}"; [ "\${FAKE_PG_RESTORE_FAIL:-0}" != 1 ]; exit; fi
if [ "$1" = "exec" ] && [[ " $* " == *" psql "* ]]; then
  if [ "$2" = "-i" ]; then cat >/dev/null; fi
  printf '0\\n0\\n0\\n0\\n0\\n0\\n0\\n0\\n8\\n0\\n0\\n'
  exit 0
fi
if [[ " $* " == *" compose "*" ps -a -q db"* ]] && [ "\${FAKE_PRODUCTION_EXISTS:-0}" = 1 ]; then printf 'existing-db\\n'; fi
exit 0
`);
  }
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, server, backupDirectory, bin, eventLog };
}

async function makeBackupSet(fixture, password = "correct-recovery-key") {
  const stem = "campus-sweep-20261005T010203Z";
  const dump = path.join(fixture.backupDirectory, `${stem}.dump.enc`);
  const encrypted = spawnSync(bash, ["-lc", "printf 'not-a-real-custom-dump' | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 -pass \"pass:$1\" -out \"$2\"", "encrypt", password, bashPath(dump)], { encoding: "utf8" });
  assert.equal(encrypted.status, 0, encrypted.stderr);
  const hash = createHash("sha256").update(await readFile(dump)).digest("hex");
  await writeFile(path.join(fixture.backupDirectory, `${stem}.dump.enc.sha256`), `${hash}  ${stem}.dump.enc\n`);
  await writeFile(path.join(fixture.backupDirectory, `${stem}.manifest.json`), `${JSON.stringify({
    formatVersion: 1,
    createdAt: "2026-10-05T01:02:03Z",
    reason: "manual",
    database: "campus_sweep",
    migrationCount: 0,
    rowCounts: { User: 0, School: 0, Building: 0, Dormitory: 0, SweepRecord: 0, SweepAudit: 0, Session: 0 },
    encryptedSha256: hash,
  }, null, 2)}\n`);
  return { stem, dump };
}

function runRestore(fixture, args, env = {}) {
  return spawnSync(bash, [bashPath(path.join(fixture.server, "restore-backup.sh")), ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bashPath(fixture.bin)}:${process.env.PATH}`, FAKE_DOCKER_LOG: bashPath(fixture.eventLog), ...env },
    timeout: 15_000,
  });
}

function waitForExit(child, label, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

test("restore rejects a missing manifest and checksum mismatch before Docker", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\n");
  const { stem, dump } = await makeBackupSet(fixture);
  await rm(path.join(fixture.backupDirectory, `${stem}.manifest.json`));
  let result = runRestore(fixture, ["verify", "--backup", bashPath(dump)]);
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(fixture.eventLog));

  await makeBackupSet(fixture);
  await writeFile(dump, "tampered");
  result = runRestore(fixture, ["verify", "--backup", bashPath(dump)]);
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(fixture.eventLog));
});
test("restore rejects a wrong key and cleans isolated Docker resources", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=wrong-recovery-key\n");
  const { dump } = await makeBackupSet(fixture);
  const result = runRestore(fixture, ["verify", "--backup", bashPath(dump)]);
  assert.notEqual(result.status, 0);
  const events = await readFile(fixture.eventLog, "utf8");
  assert.match(events, /rm -f campus-sweep-restore-/);
  assert.match(events, /volume rm -f campus-sweep-restore-/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}${events}`, /wrong-recovery-key|correct-recovery-key/);
});

test("restore cleans isolated Docker resources after pg_restore failure", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\n");
  const { dump } = await makeBackupSet(fixture);
  const result = runRestore(fixture, ["verify", "--backup", bashPath(dump)], { FAKE_PG_RESTORE_FAIL: "1" });
  assert.notEqual(result.status, 0);
  const events = await readFile(fixture.eventLog, "utf8");
  assert.match(events, /rm -f campus-sweep-restore-/);
  assert.match(events, /volume rm -f campus-sweep-restore-/);
});

test("disaster recovery requires confirmation and rejects existing production resources", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "BACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\nPOSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\n");
  const { dump } = await makeBackupSet(fixture);
  let result = runRestore(fixture, ["disaster-recovery", "--backup", bashPath(dump)]);
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(fixture.eventLog));
  result = runRestore(fixture, ["disaster-recovery", "--backup", bashPath(dump), "--confirm-empty-server"], { FAKE_PRODUCTION_EXISTS: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /已有.*数据库|不是空服务器/);
});

test("successful verify emits a redacted report and cleans resources", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\n");
  const { stem, dump } = await makeBackupSet(fixture);
  const report = path.join(fixture.root, "report.json");
  const result = runRestore(fixture, ["verify", "--backup", bashPath(dump), "--report", bashPath(report)]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(await readFile(report, "utf8"));
  assert.deepEqual({ formatVersion: parsed.formatVersion, mode: parsed.mode, backupStem: parsed.backupStem, status: parsed.status }, { formatVersion: 1, mode: "verify", backupStem: stem, status: "success" });
  assert.ok(Array.isArray(parsed.checks));
  assert.doesNotMatch(await readFile(report, "utf8"), /correct-recovery-key/);
  const events = await readFile(fixture.eventLog, "utf8");
  assert.match(events, /SHOW listen_addresses/);
  assert.match(events, /rm -f campus-sweep-restore-/);
  assert.match(events, /volume rm -f campus-sweep-restore-/);
});

test("verify removes an uploaded incoming backup set after the drill", async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\n");
  const { stem } = await makeBackupSet(fixture);
  const incoming = path.join(fixture.backupDirectory, "incoming", "0123456789abcdef0123456789abcdef");
  await mkdir(incoming, { recursive: true });
  for (const suffix of ["dump.enc", "dump.enc.sha256", "manifest.json"]) {
    await cp(path.join(fixture.backupDirectory, `${stem}.${suffix}`), path.join(incoming, `${stem}.${suffix}`));
  }
  const result = runRestore(fixture, ["verify", "--backup", bashPath(path.join(incoming, `${stem}.dump.enc`))]);
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readdir(incoming));
});

test("readiness query does not consume the restore input stream", async (t) => {
  const fixture = await makeFixture(t);
  const child = spawn(bash, [bashPath(path.join(fixture.bin, "docker")), "exec", "restore", "psql", "-X", "-qAt", "-U", "restore", "-d", "restore", "-c", "SHOW listen_addresses;"], {
    env: { ...process.env, FAKE_DOCKER_LOG: bashPath(fixture.eventLog) },
  });
  t.after(() => child.kill("SIGKILL"));
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("readiness query waited for restore input")), 1_000);
    child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /0/);
});

test("verify cleans isolated resources when interrupted", { skip: process.platform === "win32" }, async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.root, ".env.production"), "POSTGRES_DB=campus_sweep\nPOSTGRES_USER=owner\nBACKUP_ENCRYPTION_PASSWORD=correct-recovery-key\n");
  const { dump } = await makeBackupSet(fixture);
  const child = spawn(bash, [bashPath(path.join(fixture.server, "restore-backup.sh")), "verify", "--backup", bashPath(dump)], {
    cwd: fixture.root,
    env: { ...process.env, PATH: `${bashPath(fixture.bin)}:${process.env.PATH}`, FAKE_DOCKER_LOG: bashPath(fixture.eventLog), FAKE_PG_RESTORE_DELAY: "5" },
  });
  t.after(() => child.kill("SIGKILL"));
  let beforeInterrupt = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    beforeInterrupt = await readFile(fixture.eventLog, "utf8").catch(() => "");
    if (beforeInterrupt.includes("pg_restore")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(beforeInterrupt, /pg_restore/);
  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("exit", (code) => resolve(code));
    child.once("error", reject);
  });
  assert.notEqual(exitCode, 0);
  const events = await readFile(fixture.eventLog, "utf8");
  assert.match(events, /rm -f campus-sweep-restore-/);
  assert.match(events, /volume rm -f campus-sweep-restore-/);
});

test("real PostgreSQL 18 backup and isolated restore preserve the source", { skip: !hasDocker, timeout: 120_000 }, async (t) => {
  const fixture = await makeFixture(t, { fakeDocker: false });
  const project = `campus-sweep-backup-${randomBytes(6).toString("hex")}`;
  const env = { ...process.env, COMPOSE_PROJECT_NAME: project, POSTGRES_DB: "campus_sweep", POSTGRES_USER: "owner", POSTGRES_PASSWORD: "source-password", BACKUP_ENCRYPTION_PASSWORD: "round-trip-key", BACKUP_DIR: bashPath(fixture.backupDirectory) };
  await writeFile(path.join(fixture.root, ".env.production"), Object.entries(env).filter(([key]) => ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "BACKUP_ENCRYPTION_PASSWORD", "BACKUP_DIR"].includes(key)).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  const compose = (...args) => {
    const result = spawnSync("docker", ["compose", "-p", project, "-f", path.join(fixture.root, "compose.yaml"), ...args], { cwd: fixture.root, env, encoding: "utf8", timeout: 30_000 });
    if (result.error?.code === "ETIMEDOUT") throw new Error(`docker compose ${args.join(" ")} exceeded 30000ms`);
    return result;
  };
  t.after(() => compose("down", "-v", "--remove-orphans"));
  const databaseStarted = compose("up", "-d", "--wait", "db");
  assert.equal(databaseStarted.status, 0, `source database failed to become healthy:\n${databaseStarted.stdout}\n${databaseStarted.stderr}`);
  const schema = `
CREATE TABLE "_prisma_migrations" (id text primary key);
CREATE TABLE "users" (id text primary key, role text not null);
CREATE TABLE "schools" (id text primary key);
CREATE TABLE "buildings" (id text primary key, "school_id" text references "schools"(id));
CREATE TABLE "dormitories" (id text primary key, "building_id" text references "buildings"(id));
CREATE TABLE "sweep_records" (id text primary key, "agent_id" text references "users"(id), "dormitory_id" text references "dormitories"(id), UNIQUE("agent_id", "dormitory_id"));
CREATE TABLE "sweep_audits" (id text primary key);
CREATE TABLE "sessions" (id text primary key);
INSERT INTO "_prisma_migrations" VALUES ('migration-1');
INSERT INTO "users" VALUES ('admin', 'ADMIN'), ('agent', 'AGENT');
INSERT INTO "schools" VALUES ('school');
INSERT INTO "buildings" VALUES ('building', 'school');
INSERT INTO "dormitories" VALUES ('room', 'building');
INSERT INTO "sweep_records" VALUES ('record', 'agent', 'room');
INSERT INTO "sweep_audits" VALUES ('audit');
CREATE TABLE "BackupGate" (id integer primary key);
INSERT INTO "BackupGate" VALUES (1);
`;
  const seeded = spawnSync("docker", ["compose", "-p", project, "-f", path.join(fixture.root, "compose.yaml"), "exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "owner", "-d", "campus_sweep"], { cwd: fixture.root, env, input: schema, encoding: "utf8" });
  assert.equal(seeded.status, 0, seeded.stderr);
  const volumeBefore = compose("ps", "-q", "db").stdout.trim();
  let lock;
  let backup;
  t.after(() => {
    for (const child of [backup, lock]) {
      if (child?.exitCode === null) child.kill("SIGKILL");
    }
  });
  lock = spawn("docker", ["compose", "-p", project, "-f", path.join(fixture.root, "compose.yaml"), "exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "owner", "-d", "campus_sweep"], { cwd: fixture.root, env });
  lock.stdin.end('BEGIN; LOCK TABLE "BackupGate" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(5); COMMIT;\n');
  const lockExitPromise = waitForExit(lock, "database lock command", 15_000);
  let gateLocks = 0;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const held = compose("exec", "-T", "db", "psql", "-X", "-qAt", "-U", "owner", "-d", "campus_sweep", "-c", "SELECT count(*) FROM pg_locks AS lock JOIN pg_class AS relation ON relation.oid = lock.relation WHERE relation.relname = 'BackupGate' AND lock.granted;");
    gateLocks = held.status === 0 ? Number(held.stdout.trim()) : 0;
    if (gateLocks > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(gateLocks > 0, "database lock command never acquired BackupGate");
  backup = spawn(bash, [bashPath(path.join(fixture.server, "backup.sh")), "--reason", "manual"], { cwd: fixture.root, env });
  const backupExitPromise = waitForExit(backup, "backup command");
  let dumpWaits = 0;
  while (dumpWaits < 80) {
    const waiting = compose("exec", "-T", "db", "psql", "-X", "-qAt", "-U", "owner", "-d", "campus_sweep", "-c", "SELECT count(*) FROM pg_locks AS lock JOIN pg_class AS relation ON relation.oid = lock.relation WHERE relation.relname = 'BackupGate' AND NOT lock.granted;");
    if (waiting.status === 0 && Number(waiting.stdout.trim()) > 0) break;
    dumpWaits += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(dumpWaits < 40, "pg_dump never waited on the gate after exporting its snapshot");
  const concurrentWrite = compose("exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "owner", "-d", "campus_sweep", "-c", "INSERT INTO \"users\" VALUES ('late-agent', 'AGENT');");
  assert.equal(concurrentWrite.status, 0, concurrentWrite.stderr);
  const backupExit = await backupExitPromise;
  assert.equal(backupExit, 0);
  const lockExit = await lockExitPromise;
  assert.equal(lockExit, 0);
  const dumpName = (await readdir(fixture.backupDirectory)).find((name) => name.endsWith(".dump.enc"));
  assert.ok(dumpName);
  const manifest = JSON.parse(await readFile(path.join(fixture.backupDirectory, dumpName.replace(/\.dump\.enc$/, ".manifest.json")), "utf8"));
  assert.equal(manifest.rowCounts.User, 2);
  const sourceUserCount = compose("exec", "-T", "db", "psql", "-X", "-qAt", "-U", "owner", "-d", "campus_sweep", "-c", "SELECT count(*) FROM \"users\";");
  assert.equal(sourceUserCount.stdout.trim(), "3");
  const report = path.join(fixture.root, "restore-report.json");
  const restored = spawnSync(bash, [bashPath(path.join(fixture.server, "restore-backup.sh")), "verify", "--backup", bashPath(path.join(fixture.backupDirectory, dumpName)), "--report", bashPath(report)], { cwd: fixture.root, env, encoding: "utf8", timeout: 60_000 });
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(await readFile(report, "utf8")).status, "success");
  assert.equal(compose("ps", "-q", "db").stdout.trim(), volumeBefore);
});
