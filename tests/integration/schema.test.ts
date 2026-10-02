import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

async function resetDatabase() {
  await prisma.sweepAudit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.sweepRecord.deleteMany();
  await prisma.agentSchoolAccess.deleteMany();
  await prisma.quickNote.deleteMany();
  await prisma.dormitory.deleteMany();
  await prisma.building.deleteMany();
  await prisma.school.deleteMany();
  await prisma.user.deleteMany();
}

async function createFixture() {
  const admin = await prisma.user.create({
    data: {
      name: "管理员",
      passwordHash: "hash-admin",
      role: "ADMIN",
      status: "ACTIVE",
      username: "admin-fixture",
    },
  });
  const agent = await prisma.user.create({
    data: {
      name: "张三",
      passwordHash: "hash-agent",
      role: "AGENT",
      status: "ACTIVE",
      username: "agent-fixture",
    },
  });
  const school = await prisma.school.create({
    data: { name: "测试大学", sortOrder: 1 },
  });
  const building = await prisma.building.create({
    data: { name: "3号楼", schoolId: school.id, sortOrder: 1 },
  });
  const dormitory = await prisma.dormitory.create({
    data: {
      buildingId: building.id,
      floor: "2",
      roomNo: "201",
      sortOrder: 1,
    },
  });

  return { admin, agent, building, dormitory, school };
}

afterEach(resetDatabase);

describe("core schema constraints", () => {
  it("rejects duplicate agent dormitory records and school grants", async () => {
    const { admin, agent, dormitory, school } = await createFixture();

    await prisma.sweepRecord.create({
      data: { agentId: agent.id, dormitoryId: dormitory.id, status: "PENDING" },
    });
    await prisma.agentSchoolAccess.create({
      data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
    });

    await expect(
      prisma.sweepRecord.create({
        data: {
          agentId: agent.id,
          dormitoryId: dormitory.id,
          status: "COVERED",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.agentSchoolAccess.create({
        data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects duplicate building names and room numbers within their parents", async () => {
    const { building, school } = await createFixture();

    await expect(
      prisma.building.create({
        data: { name: "3号楼", schoolId: school.id, sortOrder: 2 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.dormitory.create({
        data: {
          buildingId: building.id,
          floor: "2",
          roomNo: "201",
          sortOrder: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("keeps an audit record snapshot after the current record is deleted", async () => {
    const { admin, agent, dormitory } = await createFixture();
    const record = await prisma.sweepRecord.create({
      data: {
        agentId: agent.id,
        dormitoryId: dormitory.id,
        note: "只有1个人在",
        status: "PENDING",
      },
    });
    await prisma.sweepAudit.create({
      data: {
        action: "DELETE",
        agentId: agent.id,
        beforeNote: record.note,
        beforeStatus: record.status,
        dormitoryId: dormitory.id,
        operatorId: admin.id,
        recordId: record.id,
      },
    });

    await prisma.sweepRecord.delete({ where: { id: record.id } });

    const audit = await prisma.sweepAudit.findFirstOrThrow();
    expect(audit).toMatchObject({
      beforeNote: "只有1个人在",
      beforeStatus: "PENDING",
      recordId: record.id,
    });
  });

  it("restricts deleting parents and business records with protected descendants", async () => {
    const { agent, building, dormitory, school } = await createFixture();
    await prisma.sweepRecord.create({
      data: { agentId: agent.id, dormitoryId: dormitory.id, status: "PENDING" },
    });

    await expect(prisma.user.delete({ where: { id: agent.id } })).rejects.toMatchObject(
      { code: "P2003" },
    );
    await expect(
      prisma.school.delete({ where: { id: school.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.building.delete({ where: { id: building.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.dormitory.delete({ where: { id: dormitory.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
