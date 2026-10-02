import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import {
  assertAgentSchoolAccess,
  getDormitoryDirectoryForAgent,
  listBuildingsForAgent,
  listCampusTreeForAdmin,
  listSchoolsForAgent,
} from "@/modules/campus/campus-read-service";

const fixturePrefix = "campus-read-";

afterEach(async () => {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { startsWith: fixturePrefix } },
  });
  const schools = await prisma.school.findMany({
    select: { id: true },
    where: { name: { startsWith: fixturePrefix } },
  });

  await prisma.agentSchoolAccess.deleteMany({
    where: {
      OR: [
        { agentId: { in: users.map(({ id }) => id) } },
        { schoolId: { in: schools.map(({ id }) => id) } },
      ],
    },
  });
  await prisma.dormitory.deleteMany({
    where: { building: { schoolId: { in: schools.map(({ id }) => id) } } },
  });
  await prisma.building.deleteMany({
    where: { schoolId: { in: schools.map(({ id }) => id) } },
  });
  await prisma.school.deleteMany({ where: { id: { in: schools.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
});

async function createUser(role: "ADMIN" | "AGENT") {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `${role}-${id}`,
      passwordHash: "test-only-hash",
      role,
      username: `${fixturePrefix}${id}`,
    },
  });
}

async function createCampusFixture() {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `${fixturePrefix}${suffix}-active`, sortOrder: 2 },
  });
  const inactiveSchool = await prisma.school.create({
    data: { isActive: false, name: `${fixturePrefix}${suffix}-inactive`, sortOrder: 1 },
  });
  const building = await prisma.building.create({
    data: {
      name: "3号楼",
      note: "靠近东门，备注里写着99层 999间",
      schoolId: school.id,
      sortOrder: 2,
    },
  });
  const inactiveBuilding = await prisma.building.create({
    data: {
      isActive: false,
      name: "停用楼",
      schoolId: school.id,
      sortOrder: 1,
    },
  });
  const dormitories = await Promise.all([
    prisma.dormitory.create({
      data: { buildingId: building.id, floor: "2", roomNo: "201", sortOrder: 1 },
    }),
    prisma.dormitory.create({
      data: { buildingId: building.id, floor: "2", roomNo: "202", sortOrder: 2 },
    }),
    prisma.dormitory.create({
      data: {
        buildingId: building.id,
        floor: "3",
        isActive: false,
        roomNo: "301",
        sortOrder: 3,
      },
    }),
    prisma.dormitory.create({
      data: {
        buildingId: inactiveBuilding.id,
        floor: "8",
        roomNo: "801",
        sortOrder: 1,
      },
    }),
  ]);

  return { building, dormitories, inactiveBuilding, inactiveSchool, school };
}

async function expectAccessDenied(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected access to be denied.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "SCHOOL_ACCESS_DENIED", status: 403 });
  }
}

describe("campus read service", () => {
  it("shows the complete administrator tree and derives counts only from active dormitories", async () => {
    const { building, inactiveBuilding, inactiveSchool, school } = await createCampusFixture();

    const result = await listCampusTreeForAdmin();
    const activeResult = result.find(({ id }) => id === school.id);
    const inactiveResult = result.find(({ id }) => id === inactiveSchool.id);

    expect(activeResult).toMatchObject({
      buildingCount: 2,
      dormitoryCount: 2,
      id: school.id,
      isActive: true,
      name: school.name,
    });
    expect(inactiveResult).toMatchObject({
      buildingCount: 0,
      dormitoryCount: 0,
      id: inactiveSchool.id,
      isActive: false,
    });
    expect(activeResult?.buildings.find(({ id }) => id === building.id)).toMatchObject({
      dormitoryCount: 2,
      floorCount: 1,
      id: building.id,
      note: "靠近东门，备注里写着99层 999间",
    });
    expect(activeResult?.buildings.find(({ id }) => id === inactiveBuilding.id)).toMatchObject({
      dormitoryCount: 1,
      floorCount: 1,
      id: inactiveBuilding.id,
      isActive: false,
    });
    expect(activeResult?.buildings.flatMap(({ dormitories: rows }) => rows)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isActive: true, roomNo: "201" }),
        expect.objectContaining({ isActive: false, roomNo: "301" }),
      ]),
    );
  });

  it("lists every active school with a server-derived authorization flag", async () => {
    const admin = await createUser("ADMIN");
    const agent = await createUser("AGENT");
    const { inactiveSchool, school } = await createCampusFixture();
    const secondSchool = await prisma.school.create({
      data: { name: `${fixturePrefix}${randomUUID()}-second`, sortOrder: 3 },
    });
    await prisma.agentSchoolAccess.create({
      data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
    });

    const result = await listSchoolsForAgent(agent.id);

    expect(result.filter(({ id }) => [school.id, secondSchool.id].includes(id))).toEqual([
      expect.objectContaining({ id: school.id, isAuthorized: true }),
      expect.objectContaining({ id: secondSchool.id, isAuthorized: false }),
    ]);
    expect(result.some(({ id }) => id === inactiveSchool.id)).toBe(false);
  });

  it("returns only active descendants in agent building and dormitory views", async () => {
    const admin = await createUser("ADMIN");
    const agent = await createUser("AGENT");
    const { building, dormitories, inactiveBuilding, school } = await createCampusFixture();
    await prisma.agentSchoolAccess.create({
      data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
    });

    const buildingPage = await listBuildingsForAgent(agent.id, school.id);
    const directory = await getDormitoryDirectoryForAgent(agent.id, building.id);

    expect(buildingPage).toMatchObject({ school: { id: school.id, name: school.name } });
    expect(buildingPage.buildings).toEqual([
      expect.objectContaining({
        dormitoryCount: 2,
        floorCount: 1,
        id: building.id,
      }),
    ]);
    expect(buildingPage.buildings.some(({ id }) => id === inactiveBuilding.id)).toBe(false);
    expect(directory.floors).toEqual([
      {
        dormitories: [
          expect.objectContaining({ id: dormitories[0].id, roomNo: "201" }),
          expect.objectContaining({ id: dormitories[1].id, roomNo: "202" }),
        ],
        floor: "2",
      },
    ]);
  });

  it("denies direct school, building, and directory reads immediately after access is revoked", async () => {
    const admin = await createUser("ADMIN");
    const agent = await createUser("AGENT");
    const { building, school } = await createCampusFixture();
    await prisma.agentSchoolAccess.create({
      data: { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
    });
    await expect(assertAgentSchoolAccess(agent.id, school.id)).resolves.toBeUndefined();
    await prisma.agentSchoolAccess.delete({
      where: { agentId_schoolId: { agentId: agent.id, schoolId: school.id } },
    });

    await expectAccessDenied(assertAgentSchoolAccess(agent.id, school.id));
    await expectAccessDenied(listBuildingsForAgent(agent.id, school.id));
    await expectAccessDenied(getDormitoryDirectoryForAgent(agent.id, building.id));
  });
});
