import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as directoryRoute } from "@/app/api/buildings/[buildingId]/directory/route";
import { GET as buildingsRoute } from "@/app/api/schools/[schoolId]/buildings/route";
import { GET as schoolsRoute } from "@/app/api/schools/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const prefix = "agent-campus-route-";
const origin = "http://localhost";
let cookie = "";
let agentId = "";
let adminId = "";
let schoolId = "";
let otherSchoolId = "";
let buildingId = "";

function get(path: string) {
  return new Request(`${origin}${path}`, { headers: { Cookie: cookie } });
}

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "test-only-hash", role: "ADMIN", username: `${prefix}admin-${randomUUID()}` } });
  const agent = await prisma.user.create({ data: { name: "代理", passwordHash: "test-only-hash", role: "AGENT", username: `${prefix}agent-${randomUUID()}` } });
  adminId = admin.id;
  agentId = agent.id;
  cookie = `campus_sweep_session=${(await createSession(agent.id)).token}`;
  const school = await prisma.school.create({ data: { name: `${prefix}${randomUUID()}-authorized`, sortOrder: 1 } });
  const other = await prisma.school.create({ data: { name: `${prefix}${randomUUID()}-visible`, sortOrder: 2 } });
  const inactive = await prisma.school.create({ data: { isActive: false, name: `${prefix}${randomUUID()}-inactive`, sortOrder: 0 } });
  schoolId = school.id;
  otherSchoolId = other.id;
  const building = await prisma.building.create({ data: { name: "3号楼", schoolId: school.id, sortOrder: 1 } });
  buildingId = building.id;
  await prisma.building.create({ data: { isActive: false, name: "停用楼", schoolId: school.id, sortOrder: 0 } });
  await prisma.dormitory.createMany({ data: [
    { buildingId: building.id, floor: "2", roomNo: "201", sortOrder: 201 },
    { buildingId: building.id, floor: "2", roomNo: "202", sortOrder: 202 },
    { buildingId: building.id, floor: "3", isActive: false, roomNo: "301", sortOrder: 301 },
  ] });
  await prisma.agentSchoolAccess.create({ data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id } });
  expect(inactive.id).toBeTruthy();
});

afterAll(async () => {
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } });
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const schoolIds = schools.map(({ id }) => id);
  await prisma.session.deleteMany({ where: { userId: { in: users.map(({ id }) => id) } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.dormitory.deleteMany({ where: { building: { schoolId: { in: schoolIds } } } });
  await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
});

describe("agent campus routes", () => {
  it("returns every active school with authorization derived from the session agent", async () => {
    const response = await schoolsRoute(get(`/api/schools?agentId=${adminId}`));
    const payload = await response.json() as { schools: Array<{ id: string; isAuthorized: boolean }> };

    expect(response.status).toBe(200);
    expect(payload.schools.filter(({ id }) => [schoolId, otherSchoolId].includes(id))).toEqual([
      expect.objectContaining({ id: schoolId, isAuthorized: true }),
      expect.objectContaining({ id: otherSchoolId, isAuthorized: false }),
    ]);
  });

  it("returns only active buildings and dormitories with derived counts", async () => {
    const buildings = await buildingsRoute(get(`/api/schools/${schoolId}/buildings`), { params: Promise.resolve({ schoolId }) });
    const directory = await directoryRoute(get(`/api/buildings/${buildingId}/directory`), { params: Promise.resolve({ buildingId }) });

    expect(await buildings.json()).toMatchObject({ buildings: [{ id: buildingId, floorCount: 1, dormitoryCount: 2 }] });
    expect(await directory.json()).toMatchObject({ floors: [{ floor: "2", dormitories: [{ roomNo: "201" }, { roomNo: "202" }] }] });
  });

  it("returns 403 on the next request after school access is revoked", async () => {
    await prisma.agentSchoolAccess.delete({ where: { agentId_schoolId: { agentId, schoolId } } });

    const buildings = await buildingsRoute(get(`/api/schools/${schoolId}/buildings`), { params: Promise.resolve({ schoolId }) });
    const directory = await directoryRoute(get(`/api/buildings/${buildingId}/directory`), { params: Promise.resolve({ buildingId }) });

    expect(buildings.status).toBe(403);
    expect(directory.status).toBe(403);
    await prisma.agentSchoolAccess.create({ data: { agentId, grantedBy: adminId, schoolId } });
  });
});
