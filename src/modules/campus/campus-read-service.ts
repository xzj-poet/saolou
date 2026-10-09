import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import type {
  AdminBuildingSummary,
  AdminSchoolSummary,
  AgentBuildingPage,
  AgentDormitoryDirectory,
  AgentSchoolRow,
} from "@/modules/campus/campus-types";
import { deriveOverallStatus } from "@/modules/sweep/sweep-status";

const campusOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];
const dormitoryOrder = [{ sortOrder: "asc" as const }, { roomNo: "asc" as const }];

export async function assertAgentSchoolAccess(agentId: string, schoolId: string) {
  const access = await prisma.agentSchoolAccess.findUnique({
    select: { id: true },
    where: { agentId_schoolId: { agentId, schoolId } },
  });

  if (!access) {
    throw new ApiError(403, "SCHOOL_ACCESS_DENIED", "你没有访问该学校的权限");
  }
}

export async function listCampusTreeForAdmin(): Promise<AdminSchoolSummary[]> {
  const schools = await prisma.school.findMany({
    include: {
      buildings: {
        include: {
          dormitories: {
            include: { _count: { select: { audits: true, sweepRecords: true } } },
            orderBy: dormitoryOrder,
          },
        },
        orderBy: campusOrder,
      },
    },
    orderBy: campusOrder,
  });

  return schools.map((school) => {
    const buildings: AdminBuildingSummary[] = school.buildings.map((building) => {
      const activeDormitories = building.dormitories.filter(({ isActive }) => isActive);
      return {
        dormitories: building.dormitories.map((dormitory) => ({
          floor: dormitory.floor,
          id: dormitory.id,
          isActive: dormitory.isActive,
          isProtected:
            dormitory._count.sweepRecords > 0 || dormitory._count.audits > 0,
          roomNo: dormitory.roomNo,
          sortOrder: dormitory.sortOrder,
        })),
        dormitoryCount: activeDormitories.length,
        floorCount: new Set(activeDormitories.map(({ floor }) => floor)).size,
        gender: building.gender,
        id: building.id,
        isActive: building.isActive,
        name: building.name,
        note: building.note,
        schoolId: building.schoolId,
        sortOrder: building.sortOrder,
      };
    });
    const activeBuildings = buildings.filter(({ isActive }) => isActive);

    return {
      buildingCount: buildings.length,
      buildings,
      dormitoryCount: activeBuildings.reduce(
        (sum, building) => sum + building.dormitoryCount,
        0,
      ),
      id: school.id,
      isActive: school.isActive,
      name: school.name,
      sortOrder: school.sortOrder,
    };
  });
}

export async function listSchoolsForAgent(agentId: string): Promise<AgentSchoolRow[]> {
  const schools = await prisma.school.findMany({
    include: {
      agentAccesses: { select: { id: true }, where: { agentId } },
    },
    orderBy: campusOrder,
    where: { isActive: true },
  });

  return schools.map((school) => ({
    id: school.id,
    isAuthorized: school.agentAccesses.length > 0,
    name: school.name,
    sortOrder: school.sortOrder,
  }));
}

export async function listBuildingsForAgent(
  agentId: string,
  schoolId: string,
): Promise<AgentBuildingPage> {
  const school = await prisma.school.findFirst({
    include: {
      buildings: {
        include: {
          dormitories: {
            select: { floor: true, sweepRecords: { select: { status: true } } },
            where: { isActive: true },
          },
        },
        orderBy: campusOrder,
        where: { isActive: true },
      },
    },
    where: { id: schoolId, isActive: true },
  });

  if (!school) {
    throw new ApiError(404, "SCHOOL_NOT_FOUND", "学校不存在或已停用");
  }
  await assertAgentSchoolAccess(agentId, school.id);

  return {
    buildings: school.buildings.map((building) => {
      const counts = { covered: 0, pending: 0, unvisited: 0 };
      for (const dormitory of building.dormitories) {
        const status = deriveOverallStatus(dormitory.sweepRecords.map(({ status }) => status));
        counts[status === "COVERED" ? "covered" : status === "PENDING" ? "pending" : "unvisited"] += 1;
      }
      return { counts, dormitoryCount: building.dormitories.length, floorCount: new Set(building.dormitories.map(({ floor }) => floor)).size, gender: building.gender, id: building.id, name: building.name, note: building.note, sortOrder: building.sortOrder };
    }),
    school: { id: school.id, name: school.name },
  };
}

export async function getDormitoryDirectoryForAgent(
  agentId: string,
  buildingId: string,
): Promise<AgentDormitoryDirectory> {
  const building = await prisma.building.findFirst({
    include: {
      dormitories: {
        orderBy: dormitoryOrder,
        select: { floor: true, id: true, roomNo: true, sortOrder: true },
        where: { isActive: true },
      },
      school: { select: { id: true, isActive: true, name: true } },
    },
    where: { id: buildingId, isActive: true },
  });

  if (!building || !building.school.isActive) {
    throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在或已停用");
  }
  await assertAgentSchoolAccess(agentId, building.school.id);

  const floors = new Map<
    string,
    Array<{ id: string; roomNo: string; sortOrder: number }>
  >();
  for (const dormitory of building.dormitories) {
    const rows = floors.get(dormitory.floor) ?? [];
    rows.push({ id: dormitory.id, roomNo: dormitory.roomNo, sortOrder: dormitory.sortOrder });
    floors.set(dormitory.floor, rows);
  }

  return {
    building: { id: building.id, name: building.name, note: building.note },
    floors: [...floors.entries()]
      .sort(([left], [right]) => Number(right) - Number(left) || right.localeCompare(left))
      .map(([floor, dormitories]) => ({ dormitories, floor })),
    school: { id: building.school.id, name: building.school.name },
  };
}
