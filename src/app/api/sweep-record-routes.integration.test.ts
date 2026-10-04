import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PUT as putMyRecord } from "@/app/api/dormitories/[dormitoryId]/my-record/route";
import { GET as getDormitory } from "@/app/api/dormitories/[dormitoryId]/route";
import { POST as postBatch } from "@/app/api/sweep-records/batch/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const origin = "http://localhost";
const prefix = "sweep-route-";
let cookie = "";
let agentId = "";
let schoolId = "";
let buildingId = "";
let otherBuildingId = "";
let dormitoryIds: string[] = [];
let foreignDormitoryId = "";

function request(path: string, body: unknown) {
  return new Request(`${origin}${path}`, { body: JSON.stringify(body), headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin }, method: "POST" });
}

beforeAll(async () => {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "test", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
  const agent = await prisma.user.create({ data: { name: "代理", passwordHash: "test", role: "AGENT", username: `${prefix}agent-${suffix}` } });
  agentId = agent.id;
  const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } }); schoolId = school.id;
  const building = await prisma.building.create({ data: { name: "1号楼", schoolId } }); buildingId = building.id;
  const other = await prisma.building.create({ data: { name: "2号楼", schoolId } }); otherBuildingId = other.id;
  dormitoryIds = (await Promise.all(["101", "102"].map((roomNo) => prisma.dormitory.create({ data: { buildingId, floor: "1", roomNo } })))).map(({ id }) => id);
  foreignDormitoryId = (await prisma.dormitory.create({ data: { buildingId: otherBuildingId, floor: "1", roomNo: "201" } })).id;
  await prisma.agentSchoolAccess.create({ data: { agentId, grantedBy: admin.id, schoolId } });
  cookie = `campus_sweep_session=${(await createSession(agentId)).token}`;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const ids = users.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { agentId: { in: ids } } });
  await prisma.sweepRecord.deleteMany({ where: { agentId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { agentId: { in: ids } } });
  await prisma.dormitory.deleteMany({ where: { buildingId: { in: [buildingId, otherBuildingId] } } });
  await prisma.building.deleteMany({ where: { id: { in: [buildingId, otherBuildingId] } } });
  await prisma.school.deleteMany({ where: { id: schoolId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("agent sweep record routes", () => {
  it("derives ownership from the session and upserts one current record", async () => {
    const response = await putMyRecord(request(`/api/dormitories/${dormitoryIds[0]}/my-record`, { customNote: "稍后再来", expectedRecordId: null, expectedVersion: null, status: "PENDING" }), { params: Promise.resolve({ dormitoryId: dormitoryIds[0] }) });
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created).toMatchObject({ changed: true, overallStatus: "PENDING", record: { agentId, note: "稍后再来", version: 1 } });

    const detail = await getDormitory(new Request(`${origin}/api/dormitories/${dormitoryIds[0]}`, { headers: { Cookie: cookie } }), { params: Promise.resolve({ dormitoryId: dormitoryIds[0] }) });
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({ myRecord: { id: created.record.id, version: 1 } });

    const updated = await putMyRecord(request(`/api/dormitories/${dormitoryIds[0]}/my-record`, { customNote: "已经更新", expectedRecordId: created.record.id, expectedVersion: 1, status: "COVERED" }), { params: Promise.resolve({ dormitoryId: dormitoryIds[0] }) });
    expect(updated.status).toBe(200);
    const conflict = await putMyRecord(request(`/api/dormitories/${dormitoryIds[0]}/my-record`, { customNote: "已经更新", expectedRecordId: created.record.id, expectedVersion: 1, status: "COVERED" }), { params: Promise.resolve({ dormitoryId: dormitoryIds[0] }) });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: "RECORD_CONFLICT", fields: { conflicts: [{ dormitoryId: dormitoryIds[0], reason: "UPDATED" }] } } });

    const halfNull = await putMyRecord(request(`/api/dormitories/${dormitoryIds[1]}/my-record`, { expectedRecordId: null, expectedVersion: 1, status: "PENDING" }), { params: Promise.resolve({ dormitoryId: dormitoryIds[1] }) });
    expect(halfNull.status).toBe(400);

    const forged = await putMyRecord(request(`/api/dormitories/${dormitoryIds[0]}/my-record`, { agentId: randomUUID(), expectedRecordId: created.record.id, expectedVersion: 2, status: "COVERED" }), { params: Promise.resolve({ dormitoryId: dormitoryIds[0] }) });
    expect(forged.status).toBe(400);
    expect(await prisma.sweepRecord.count({ where: { dormitoryId: dormitoryIds[0] } })).toBe(1);
  });

  it("atomically deduplicates and upserts a batch but rolls back mixed-building targets", async () => {
    const existing = await prisma.sweepRecord.findUniqueOrThrow({ where: { agentId_dormitoryId: { agentId, dormitoryId: dormitoryIds[0] } } });
    const response = await postBatch(request("/api/sweep-records/batch", { buildingId, customNote: "统一完成", targets: [{ dormitoryId: dormitoryIds[0], expectedRecordId: existing.id, expectedVersion: existing.version }, { dormitoryId: dormitoryIds[1], expectedRecordId: null, expectedVersion: null }, { dormitoryId: dormitoryIds[1], expectedRecordId: null, expectedVersion: null }], status: "COVERED" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ counts: { covered: 2, pending: 0, unvisited: 0 }, results: [{ overallStatus: "COVERED" }, { overallStatus: "COVERED" }] });

    const before = await prisma.sweepAudit.count({ where: { agentId } });
    const current = await prisma.sweepRecord.findUniqueOrThrow({ where: { agentId_dormitoryId: { agentId, dormitoryId: dormitoryIds[0] } } });
    const rejected = await postBatch(request("/api/sweep-records/batch", { buildingId, targets: [{ dormitoryId: dormitoryIds[0], expectedRecordId: current.id, expectedVersion: current.version }, { dormitoryId: foreignDormitoryId, expectedRecordId: null, expectedVersion: null }], status: "PENDING" }));
    expect(rejected.status).toBe(400);
    expect(await prisma.sweepAudit.count({ where: { agentId } })).toBe(before);
    expect(await prisma.sweepRecord.findUnique({ where: { agentId_dormitoryId: { agentId, dormitoryId: dormitoryIds[0] } } })).toMatchObject({ status: "COVERED" });
  });

  it("rejects oversized batches and revoked access before writing", async () => {
    const tooMany = await postBatch(request("/api/sweep-records/batch", { buildingId, targets: Array.from({ length: 101 }, () => ({ dormitoryId: randomUUID(), expectedRecordId: null, expectedVersion: null })), status: "PENDING" }));
    expect(tooMany.status).toBe(400);
    await prisma.agentSchoolAccess.delete({ where: { agentId_schoolId: { agentId, schoolId } } });
    const denied = await postBatch(request("/api/sweep-records/batch", { buildingId, targets: [{ dormitoryId: dormitoryIds[1], expectedRecordId: null, expectedVersion: null }], status: "PENDING" }));
    expect(denied.status).toBe(403);
  });
});
