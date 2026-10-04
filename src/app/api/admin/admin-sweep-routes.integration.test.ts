import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getAudits } from "@/app/api/admin/sweep-audits/route";
import { GET as getRecords } from "@/app/api/admin/sweep-records/route";
import { DELETE, PUT } from "@/app/api/admin/sweep-records/[recordId]/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const recordId = "00000000-0000-0000-0000-000000000000";
const context = { params: Promise.resolve({ recordId }) };
const prefix = "admin-sweep-route-";
let adminId = "";
let buildingId = "";
let cookie = "";
let liveRecordId = "";
let schoolId = "";

beforeAll(async () => {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "x", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
  const agent = await prisma.user.create({ data: { name: "代理", passwordHash: "x", role: "AGENT", username: `${prefix}agent-${suffix}` } });
  const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } });
  const building = await prisma.building.create({ data: { name: "9号楼", schoolId: school.id } });
  const dormitory = await prisma.dormitory.create({ data: { buildingId: building.id, floor: "1", roomNo: "101" } });
  const record = await prisma.sweepRecord.create({ data: { agentId: agent.id, dormitoryId: dormitory.id, note: "初始", status: "PENDING" } });
  adminId = admin.id;
  buildingId = building.id;
  cookie = `campus_sweep_session=${(await createSession(admin.id)).token}`;
  liveRecordId = record.id;
  schoolId = school.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const userIds = users.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { operatorId: adminId } });
  await prisma.sweepRecord.deleteMany({ where: { agentId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.dormitory.deleteMany({ where: { buildingId } });
  await prisma.building.deleteMany({ where: { id: buildingId } });
  await prisma.school.deleteMany({ where: { id: schoolId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

function mutationRequest(method: "DELETE" | "PUT", body: unknown) {
  return new Request(`http://localhost/api/admin/sweep-records/${liveRecordId}`, {
    body: JSON.stringify(body),
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "http://localhost" },
    method,
  });
}

describe("administrator sweep routes", () => {
  it.each([
    ["records", (request: Request) => getRecords(request), "GET", "/api/admin/sweep-records"],
    ["audits", (request: Request) => getAudits(request), "GET", "/api/admin/sweep-audits"],
    ["update", (request: Request) => PUT(request, context), "PUT", `/api/admin/sweep-records/${recordId}`],
    ["delete", (request: Request) => DELETE(request, context), "DELETE", `/api/admin/sweep-records/${recordId}`],
  ])("requires an administrator for %s", async (_name, handler, method, path) => {
    const response = await handler(new Request(`http://localhost${path}`, { body: method === "PUT" ? "{}" : undefined, headers: { origin: "http://localhost" }, method }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("returns stable conflicts for stale administrator update and delete requests", async () => {
    const liveContext = { params: Promise.resolve({ recordId: liveRecordId }) };
    const updated = await PUT(mutationRequest("PUT", { customNote: "新版", expectedRecordId: liveRecordId, expectedVersion: 1, status: "COVERED" }), liveContext);
    expect(updated.status).toBe(200);

    const staleUpdate = await PUT(mutationRequest("PUT", { customNote: "旧版", expectedRecordId: liveRecordId, expectedVersion: 1, status: "PENDING" }), liveContext);
    expect(staleUpdate.status).toBe(409);
    await expect(staleUpdate.json()).resolves.toMatchObject({ error: { code: "RECORD_CONFLICT", fields: { conflicts: [{ reason: "UPDATED" }] } } });

    const staleDelete = await DELETE(mutationRequest("DELETE", { expectedVersion: 1 }), liveContext);
    expect(staleDelete.status).toBe(409);
    const deleted = await DELETE(mutationRequest("DELETE", { expectedVersion: 2 }), liveContext);
    expect(deleted.status).toBe(200);
  });
});
