import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import type { DormitoryRangeInput } from "@/modules/campus/dormitory-range";
import { DormitoryRangeError, generateDormitoryRange } from "@/modules/campus/dormitory-range";

type SchoolInput = { name: string };
type BuildingCreateInput = { gender?: "MALE" | "FEMALE"; name: string; note?: string | null; schoolId: string };
type BuildingUpdateInput = { gender?: "MALE" | "FEMALE"; name?: string; note?: string | null };
type DormitoryCreateInput = { buildingId: string; floor: string; roomNo: string };

function normalizedName(name: string) {
  return name.trim();
}

function normalizedNote(note: string | null | undefined) {
  const value = note?.trim();
  return value ? value : null;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002",
  );
}

function isRecordNotFoundError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2025",
  );
}

async function buildingCounts(
  client: Pick<typeof prisma, "dormitory">,
  buildingId: string,
) {
  const active = await client.dormitory.findMany({
    select: { floor: true },
    where: { buildingId, isActive: true },
  });
  return {
    dormitoryCount: active.length,
    floorCount: new Set(active.map(({ floor }) => floor)).size,
  };
}

function rangeError(error: unknown): never {
  if (error instanceof DormitoryRangeError) {
    throw new ApiError(400, error.code, error.message);
  }
  throw error;
}

export async function createSchool(input: SchoolInput) {
  try {
    return await prisma.school.create({ data: { name: normalizedName(input.name) } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "SCHOOL_NAME_CONFLICT", "学校名称已存在");
    }
    throw error;
  }
}

export async function updateSchool(id: string, input: SchoolInput) {
  try {
    return await prisma.school.update({
      data: { name: normalizedName(input.name) },
      where: { id },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "SCHOOL_NAME_CONFLICT", "学校名称已存在");
    }
    if (isRecordNotFoundError(error)) {
      throw new ApiError(404, "SCHOOL_NOT_FOUND", "学校不存在");
    }
    throw error;
  }
}

export async function setSchoolActive(id: string, isActive: boolean) {
  try {
    return await prisma.school.update({ data: { isActive }, where: { id } });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new ApiError(404, "SCHOOL_NOT_FOUND", "学校不存在");
    }
    throw error;
  }
}

export async function retireSchool(id: string): Promise<{ action: "DELETED" | "DISABLED" }> {
  return prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      include: { _count: { select: { buildings: true } } },
      where: { id },
    });
    if (!school) throw new ApiError(404, "SCHOOL_NOT_FOUND", "学校不存在");
    if (school._count.buildings === 0) {
      await tx.school.delete({ where: { id } });
      return { action: "DELETED" };
    }
    await tx.school.update({ data: { isActive: false }, where: { id } });
    return { action: "DISABLED" };
  });
}

export async function createBuilding(input: BuildingCreateInput) {
  const school = await prisma.school.findUnique({ select: { id: true }, where: { id: input.schoolId } });
  if (!school) throw new ApiError(404, "SCHOOL_NOT_FOUND", "学校不存在");
  try {
    return await prisma.building.create({
      data: {
        gender: input.gender ?? "MALE",
        name: normalizedName(input.name),
        note: normalizedNote(input.note),
        schoolId: input.schoolId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "BUILDING_NAME_CONFLICT", "该学校已有同名楼栋");
    }
    throw error;
  }
}

export async function updateBuilding(id: string, input: BuildingUpdateInput) {
  try {
    return await prisma.building.update({
      data: {
        ...(input.gender === undefined ? {} : { gender: input.gender }),
        ...(input.name === undefined ? {} : { name: normalizedName(input.name) }),
        ...(input.note === undefined ? {} : { note: normalizedNote(input.note) }),
      },
      where: { id },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "BUILDING_NAME_CONFLICT", "该学校已有同名楼栋");
    }
    if (isRecordNotFoundError(error)) {
      throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
    }
    throw error;
  }
}

export async function setBuildingActive(id: string, isActive: boolean) {
  try {
    return await prisma.building.update({ data: { isActive }, where: { id } });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
    }
    throw error;
  }
}

export async function retireBuilding(id: string): Promise<{ action: "DELETED" | "DISABLED" }> {
  return prisma.$transaction(async (tx) => {
    const building = await tx.building.findUnique({
      include: { _count: { select: { dormitories: true } } },
      where: { id },
    });
    if (!building) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
    if (building._count.dormitories === 0) {
      await tx.building.delete({ where: { id } });
      return { action: "DELETED" };
    }
    await tx.building.update({ data: { isActive: false }, where: { id } });
    return { action: "DISABLED" };
  });
}

export async function addDormitory(input: DormitoryCreateInput) {
  const building = await prisma.building.findUnique({ select: { id: true }, where: { id: input.buildingId } });
  if (!building) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
  try {
    return await prisma.dormitory.create({
      data: {
        buildingId: input.buildingId,
        floor: input.floor.trim(),
        roomNo: input.roomNo.trim(),
        sortOrder: Number.parseInt(input.roomNo, 10) || 0,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "DORMITORY_NUMBER_CONFLICT", "该楼栋已有相同宿舍号");
    }
    throw error;
  }
}

export async function previewDormitoryBatch(buildingId: string, range: DormitoryRangeInput) {
  const building = await prisma.building.findUnique({ select: { id: true }, where: { id: buildingId } });
  if (!building) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
  let generated;
  try {
    generated = generateDormitoryRange(range);
  } catch (error) {
    return rangeError(error);
  }
  const existing = await prisma.dormitory.findMany({
    select: { roomNo: true },
    where: { buildingId, roomNo: { in: generated.map(({ roomNo }) => roomNo) } },
  });
  const existingSet = new Set(existing.map(({ roomNo }) => roomNo));
  return {
    duplicates: generated.filter(({ roomNo }) => existingSet.has(roomNo)).map(({ roomNo }) => roomNo),
    newDormitories: generated.filter(({ roomNo }) => !existingSet.has(roomNo)),
    roomNumbers: generated.map(({ roomNo }) => roomNo),
  };
}

export async function addDormitoryBatch(buildingId: string, range: DormitoryRangeInput) {
  let generated;
  try {
    generated = generateDormitoryRange(range);
  } catch (error) {
    return rangeError(error);
  }
  return prisma.$transaction(async (tx) => {
    const building = await tx.building.findUnique({ select: { id: true }, where: { id: buildingId } });
    if (!building) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在");
    const existing = await tx.dormitory.findMany({
      select: { roomNo: true },
      where: { buildingId, roomNo: { in: generated.map(({ roomNo }) => roomNo) } },
    });
    const existingSet = new Set(existing.map(({ roomNo }) => roomNo));
    const fresh = generated.filter(({ roomNo }) => !existingSet.has(roomNo));
    if (fresh.length > 0) {
      await tx.dormitory.createMany({
        data: fresh.map((dormitory) => ({ ...dormitory, buildingId })),
        skipDuplicates: true,
      });
    }
    return {
      created: fresh.map(({ roomNo }) => roomNo),
      duplicates: generated.filter(({ roomNo }) => existingSet.has(roomNo)).map(({ roomNo }) => roomNo),
      ...(await buildingCounts(tx, buildingId)),
    };
  });
}

export async function setDormitoryActive(id: string, isActive: boolean) {
  try {
    return await prisma.dormitory.update({ data: { isActive }, where: { id } });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new ApiError(404, "DORMITORY_NOT_FOUND", "宿舍不存在");
    }
    throw error;
  }
}

export async function retireDormitories(buildingId: string, dormitoryIds: string[]) {
  const uniqueIds = [...new Set(dormitoryIds)];
  return prisma.$transaction(async (tx) => {
    const rows = await tx.dormitory.findMany({
      include: { _count: { select: { audits: true, sweepRecords: true } } },
      where: { buildingId, id: { in: uniqueIds } },
    });
    if (rows.length !== uniqueIds.length) {
      throw new ApiError(404, "DORMITORY_NOT_FOUND", "所选宿舍不存在或不属于该楼栋");
    }
    const protectedRows = rows.filter(
      ({ _count }) => _count.audits > 0 || _count.sweepRecords > 0,
    );
    const disposableRows = rows.filter(
      ({ _count }) => _count.audits === 0 && _count.sweepRecords === 0,
    );
    if (protectedRows.length > 0) {
      await tx.dormitory.updateMany({
        data: { isActive: false },
        where: { id: { in: protectedRows.map(({ id }) => id) } },
      });
    }
    if (disposableRows.length > 0) {
      await tx.dormitory.deleteMany({
        where: { id: { in: disposableRows.map(({ id }) => id) } },
      });
    }
    return {
      deleted: disposableRows.map(({ roomNo }) => roomNo).sort(),
      disabled: protectedRows.map(({ roomNo }) => roomNo).sort(),
      ...(await buildingCounts(tx, buildingId)),
    };
  });
}
