import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { assertAgentSchoolAccess } from "@/modules/campus/campus-read-service";
import { deriveOverallStatus } from "@/modules/sweep/sweep-status";

async function getActiveDormitoryForAgent(agentId: string, dormitoryId: string) {
  const dormitory = await prisma.dormitory.findFirst({
    include: {
      building: {
        include: { school: { select: { id: true, isActive: true, name: true } } },
      },
      sweepRecords: {
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
    where: { id: dormitoryId, isActive: true },
  });
  if (!dormitory || !dormitory.building.isActive || !dormitory.building.school.isActive) {
    throw new ApiError(404, "DORMITORY_NOT_FOUND", "宿舍不存在或已停用");
  }
  await assertAgentSchoolAccess(agentId, dormitory.building.school.id);
  return dormitory;
}

function dormitoryMetadata(dormitory: Awaited<ReturnType<typeof getActiveDormitoryForAgent>>) {
  return {
    building: { id: dormitory.building.id, name: dormitory.building.name },
    dormitory: { floor: dormitory.floor, id: dormitory.id, roomNo: dormitory.roomNo },
    overallStatus: deriveOverallStatus(dormitory.sweepRecords.map(({ status }) => status)),
    school: { id: dormitory.building.school.id, name: dormitory.building.school.name },
  };
}

export async function getDormitoryDetailForAgent(agentId: string, dormitoryId: string) {
  const dormitory = await getActiveDormitoryForAgent(agentId, dormitoryId);
  const myRecord = dormitory.sweepRecords.find((record) => record.agentId === agentId);
  return {
    ...dormitoryMetadata(dormitory),
    hasMyRecord: Boolean(myRecord),
    myRecord: myRecord
      ? { agentId: myRecord.agentId, id: myRecord.id, note: myRecord.note, status: myRecord.status, updatedAt: myRecord.updatedAt, version: myRecord.version }
      : null,
  };
}

export async function getDormitoryLatestRecordsForAgent(agentId: string, dormitoryId: string) {
  const dormitory = await getActiveDormitoryForAgent(agentId, dormitoryId);
  return {
    ...dormitoryMetadata(dormitory),
    records: dormitory.sweepRecords.map((record) => ({
      agent: record.agent,
      id: record.id,
      note: record.note,
      status: record.status,
      updatedAt: record.updatedAt,
      version: record.version,
    })),
  };
}

export async function getBuildingMatrixForAgent(agentId: string, buildingId: string, floor?: string) {
  const building = await prisma.building.findFirst({
    include: {
      dormitories: {
        include: { sweepRecords: { select: { agentId: true, status: true } } },
        orderBy: [{ sortOrder: "asc" }, { roomNo: "asc" }],
        where: { isActive: true },
      },
      school: { select: { id: true, isActive: true, name: true } },
    },
    where: { id: buildingId, isActive: true },
  });
  if (!building || !building.school.isActive) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在或已停用");
  await assertAgentSchoolAccess(agentId, building.school.id);
  const counts = { covered: 0, pending: 0, unvisited: 0 };
  const rows = building.dormitories.map((dormitory) => {
    const overallStatus = deriveOverallStatus(dormitory.sweepRecords.map(({ status }) => status));
    counts[overallStatus === "COVERED" ? "covered" : overallStatus === "PENDING" ? "pending" : "unvisited"] += 1;
    return { floor: dormitory.floor, hasMyRecord: dormitory.sweepRecords.some((record) => record.agentId === agentId), id: dormitory.id, overallStatus, roomNo: dormitory.roomNo, sortOrder: dormitory.sortOrder };
  });
  const floors = new Map<string, typeof rows>();
  for (const row of rows) { if (floor && row.floor !== floor) continue; const values = floors.get(row.floor) ?? []; values.push(row); floors.set(row.floor, values); }
  return {
    building: { id: building.id, name: building.name, note: building.note }, counts,
    floors: [...floors.entries()].sort(([a],[b]) => Number(b)-Number(a) || b.localeCompare(a)).map(([floorName,dormitories]) => ({ floor: floorName, dormitories })),
    school: { id: building.school.id, name: building.school.name },
  };
}
