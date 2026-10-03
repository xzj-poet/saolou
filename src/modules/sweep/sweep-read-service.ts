import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { assertAgentSchoolAccess } from "@/modules/campus/campus-read-service";
import { deriveOverallStatus } from "@/modules/sweep/sweep-status";

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
