import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import {
  addDormitory,
  addDormitoryBatch,
  createBuilding,
  createSchool,
  previewDormitoryBatch,
  retireBuilding,
  retireDormitories,
  retireSchool,
  setBuildingActive,
  setDormitoryActive,
  setSchoolActive,
  updateBuilding,
  updateSchool,
} from "@/modules/campus/campus-admin-service";

const prefix = "campus-admin-";

afterEach(async () => {
  const schools = await prisma.school.findMany({
    select: { id: true },
    where: { name: { startsWith: prefix } },
  });
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { startsWith: prefix } },
  });
  const schoolIds = schools.map(({ id }) => id);
  const userIds = users.map(({ id }) => id);
  const dormitories = await prisma.dormitory.findMany({
    select: { id: true },
    where: { building: { schoolId: { in: schoolIds } } },
  });
  const dormitoryIds = dormitories.map(({ id }) => id);

  await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.agentSchoolAccess.deleteMany({
    where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] },
  });
  await prisma.dormitory.deleteMany({ where: { id: { in: dormitoryIds } } });
  await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function createAgent() {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `${prefix}${id}`,
      passwordHash: "test-only-hash",
      role: "AGENT",
      username: `${prefix}${id}`,
    },
  });
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error("Expected ApiError.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("administrator campus service", () => {
  it("normalizes school data, maps duplicates to 409, and deletes an empty school", async () => {
    const name = `${prefix}${randomUUID()}`;
    const school = await createSchool({ name: `  ${name}  ` });

    expect(school.name).toBe(name);
    await expectApiError(createSchool({ name }), 409, "SCHOOL_NAME_CONFLICT");

    const renamed = await updateSchool(school.id, { name: `${name}-renamed` });
    expect(renamed.name).toBe(`${name}-renamed`);
    await setSchoolActive(school.id, false);
    expect(await prisma.school.findUnique({ where: { id: school.id } })).toMatchObject({
      isActive: false,
    });
    await setSchoolActive(school.id, true);

    await expect(retireSchool(school.id)).resolves.toEqual({ action: "DELETED" });
    await expect(prisma.school.findUnique({ where: { id: school.id } })).resolves.toBeNull();
  });

  it("manages building fields while disabling populated schools and buildings", async () => {
    const school = await createSchool({ name: `${prefix}${randomUUID()}` });
    const building = await createBuilding({
      name: " 3号楼 ",
      note: " 靠近东门 ",
      schoolId: school.id,
    });

    expect(building).toMatchObject({ gender: "MALE", name: "3号楼", note: "靠近东门" });
    await expectApiError(
      createBuilding({ name: "3号楼", schoolId: school.id }),
      409,
      "BUILDING_NAME_CONFLICT",
    );
    await expect(updateBuilding(building.id, { gender: "FEMALE", name: "三号楼", note: " 夜间通行 " })).resolves.toMatchObject({
      gender: "FEMALE",
      name: "三号楼",
      note: "夜间通行",
    });
    await setBuildingActive(building.id, false);
    await setBuildingActive(building.id, true);

    const dormitory = await addDormitory({ buildingId: building.id, floor: "2", roomNo: "201" });
    await expect(retireBuilding(building.id)).resolves.toEqual({ action: "DISABLED" });
    await expect(retireSchool(school.id)).resolves.toEqual({ action: "DISABLED" });
    expect(await prisma.building.findUnique({ where: { id: building.id } })).toMatchObject({
      isActive: false,
    });
    expect(await prisma.school.findUnique({ where: { id: school.id } })).toMatchObject({
      isActive: false,
    });
    await setDormitoryActive(dormitory.id, false);
    await setDormitoryActive(dormitory.id, true);
  });

  it("previews duplicates and batch-creates only new dormitories", async () => {
    const school = await createSchool({ name: `${prefix}${randomUUID()}` });
    const building = await createBuilding({ name: "3号楼", schoolId: school.id });
    await addDormitory({ buildingId: building.id, floor: "2", roomNo: "201" });
    const range = { floorEnd: 2, floorStart: 2, roomEnd: 3, roomStart: 1 };

    await expect(previewDormitoryBatch(building.id, range)).resolves.toEqual({
      duplicates: ["201"],
      newDormitories: [
        { floor: "2", roomNo: "202", sortOrder: 202 },
        { floor: "2", roomNo: "203", sortOrder: 203 },
      ],
      roomNumbers: ["201", "202", "203"],
    });
    await expect(addDormitoryBatch(building.id, range)).resolves.toMatchObject({
      created: ["202", "203"],
      duplicates: ["201"],
      dormitoryCount: 3,
      floorCount: 1,
    });
    expect(
      await prisma.dormitory.findMany({
        orderBy: { roomNo: "asc" },
        select: { roomNo: true },
        where: { buildingId: building.id },
      }),
    ).toEqual([{ roomNo: "201" }, { roomNo: "202" }, { roomNo: "203" }]);
  });

  it("atomically disables protected dormitories and deletes unused selections", async () => {
    const school = await createSchool({ name: `${prefix}${randomUUID()}` });
    const building = await createBuilding({ name: "3号楼", schoolId: school.id });
    const protectedDormitory = await addDormitory({
      buildingId: building.id,
      floor: "2",
      roomNo: "201",
    });
    const emptyDormitory = await addDormitory({
      buildingId: building.id,
      floor: "2",
      roomNo: "202",
    });
    const agent = await createAgent();
    await prisma.sweepRecord.create({
      data: {
        agentId: agent.id,
        dormitoryId: protectedDormitory.id,
        note: "历史文本必须保留",
        status: "PENDING",
      },
    });

    await expect(
      retireDormitories(building.id, [protectedDormitory.id, emptyDormitory.id]),
    ).resolves.toEqual({
      deleted: ["202"],
      disabled: ["201"],
      dormitoryCount: 0,
      floorCount: 0,
    });
    expect(
      await prisma.dormitory.findUnique({ where: { id: protectedDormitory.id } }),
    ).toMatchObject({ isActive: false });
    await expect(
      prisma.dormitory.findUnique({ where: { id: emptyDormitory.id } }),
    ).resolves.toBeNull();
    expect(
      await prisma.sweepRecord.findUnique({
        where: {
          agentId_dormitoryId: {
            agentId: agent.id,
            dormitoryId: protectedDormitory.id,
          },
        },
      }),
    ).toMatchObject({ note: "历史文本必须保留" });
  });
});
