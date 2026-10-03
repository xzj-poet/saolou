import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  getDormitoryDetailForAgent,
  getDormitoryLatestRecordsForAgent,
} from "@/modules/sweep/sweep-read-service";

const prefix = "sweep-detail-";

afterEach(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } });
  const userIds = users.map(({ id }) => id);
  const schoolIds = schools.map(({ id }) => id);
  const dormitories = await prisma.dormitory.findMany({ select: { id: true }, where: { building: { schoolId: { in: schoolIds } } } });
  const dormitoryIds = dormitories.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.dormitory.deleteMany({ where: { id: { in: dormitoryIds } } });
  await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function fixture() {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "x", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
  const me = await prisma.user.create({ data: { name: "张三", passwordHash: "x", role: "AGENT", username: `${prefix}me-${suffix}` } });
  const other = await prisma.user.create({ data: { name: "李四", passwordHash: "x", role: "AGENT", username: `${prefix}other-${suffix}` } });
  const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } });
  const building = await prisma.building.create({ data: { name: "3号楼", schoolId: school.id } });
  const dormitory = await prisma.dormitory.create({ data: { buildingId: building.id, floor: "2", roomNo: "201" } });
  await prisma.agentSchoolAccess.create({ data: { agentId: me.id, grantedBy: admin.id, schoolId: school.id } });
  return { building, dormitory, me, other, school };
}

describe("dormitory detail read models", () => {
  it("returns the overall status and only the current agent's record on detail", async () => {
    const { dormitory, me, other } = await fixture();
    await prisma.sweepRecord.createMany({ data: [
      { agentId: me.id, dormitoryId: dormitory.id, note: null, status: "PENDING" },
      { agentId: other.id, dormitoryId: dormitory.id, note: "其他代理备注", status: "COVERED" },
    ] });

    const detail = await getDormitoryDetailForAgent(me.id, dormitory.id);
    expect(detail).toMatchObject({ hasMyRecord: true, overallStatus: "COVERED", myRecord: { agentId: me.id, note: null, status: "PENDING" } });
    expect(JSON.stringify(detail)).not.toContain("其他代理备注");
  });

  it("signals the record editor when the current agent has no record", async () => {
    const { dormitory, me, other } = await fixture();
    await prisma.sweepRecord.create({ data: { agentId: other.id, dormitoryId: dormitory.id, status: "PENDING" } });
    await expect(getDormitoryDetailForAgent(me.id, dormitory.id)).resolves.toMatchObject({ hasMyRecord: false, myRecord: null, overallStatus: "PENDING" });
  });

  it("returns one latest current result per agent ordered by modification time", async () => {
    const { dormitory, me, other } = await fixture();
    await prisma.sweepRecord.create({ data: { agentId: other.id, dormitoryId: dormitory.id, note: "先写", status: "PENDING", updatedAt: new Date("2026-10-01T10:00:00Z") } });
    await prisma.sweepRecord.create({ data: { agentId: me.id, dormitoryId: dormitory.id, note: "后写", status: "COVERED", updatedAt: new Date("2026-10-02T10:00:00Z") } });

    const history = await getDormitoryLatestRecordsForAgent(me.id, dormitory.id);
    expect(history.records).toMatchObject([{ agent: { id: me.id, name: "张三" }, note: "后写", status: "COVERED" }, { agent: { id: other.id, name: "李四" }, note: "先写", status: "PENDING" }]);
  });

  it("rejects revoked access and inactive dormitories", async () => {
    const { dormitory, me, school } = await fixture();
    await prisma.agentSchoolAccess.delete({ where: { agentId_schoolId: { agentId: me.id, schoolId: school.id } } });
    await expect(getDormitoryDetailForAgent(me.id, dormitory.id)).rejects.toMatchObject({ code: "SCHOOL_ACCESS_DENIED", status: 403 });
    await prisma.dormitory.update({ data: { isActive: false }, where: { id: dormitory.id } });
    await expect(getDormitoryLatestRecordsForAgent(me.id, dormitory.id)).rejects.toMatchObject({ code: "DORMITORY_NOT_FOUND", status: 404 });
  });
});
