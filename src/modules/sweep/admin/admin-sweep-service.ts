import type { AuditAction, Prisma, SweepStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { upsertAgentRecord } from "@/modules/sweep/sweep-record-service";

export type SweepRecordFilters = {
  agentId?: string;
  buildingId?: string;
  roomNo?: string;
  schoolId?: string;
  status?: SweepStatus;
};

export type SweepAuditFilters = SweepRecordFilters & {
  action?: AuditAction;
  dormitoryId?: string;
  recordId?: string;
};

export async function listSweepRecords(filters: SweepRecordFilters = {}) {
  const where: Prisma.SweepRecordWhereInput = {
    ...(filters.agentId ? { agentId: filters.agentId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    dormitory: {
      ...(filters.roomNo ? { roomNo: { contains: filters.roomNo, mode: "insensitive" } } : {}),
      building: {
        ...(filters.buildingId ? { id: filters.buildingId } : {}),
        ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
      },
    },
  };
  return prisma.sweepRecord.findMany({
    include: {
      agent: { select: { id: true, name: true } },
      dormitory: { include: { building: { include: { school: { select: { id: true, name: true } } } } } },
    },
    orderBy: { updatedAt: "desc" },
    where,
  });
}

export async function updateSweepRecordAsAdmin(recordId: string, input: { customNote?: string | null; status: SweepStatus }, adminId: string) {
  const record = await prisma.sweepRecord.findUnique({ select: { agentId: true, dormitoryId: true, id: true, version: true }, where: { id: recordId } });
  if (!record) throw new ApiError(404, "SWEEP_RECORD_NOT_FOUND", "扫楼记录不存在");
  return upsertAgentRecord({
    ...input,
    agentId: record.agentId,
    dormitoryId: record.dormitoryId,
    expectedRecordId: record.id,
    expectedVersion: record.version,
  }, { id: adminId, role: "ADMIN" });
}

export async function deleteSweepRecordAsAdmin(recordId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${recordId})) IS NULL AS locked`;
    const record = await tx.sweepRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new ApiError(404, "SWEEP_RECORD_NOT_FOUND", "扫楼记录不存在");
    await tx.sweepAudit.create({ data: {
      action: "DELETE",
      agentId: record.agentId,
      beforeNote: record.note,
      beforeStatus: record.status,
      dormitoryId: record.dormitoryId,
      operatorId: adminId,
      recordId: record.id,
    } });
    await tx.sweepRecord.delete({ where: { id: record.id } });
    return { deleted: true, dormitoryId: record.dormitoryId };
  });
}

export async function listSweepAudits(filters: SweepAuditFilters = {}) {
  const where: Prisma.SweepAuditWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.agentId ? { agentId: filters.agentId } : {}),
    ...(filters.dormitoryId ? { dormitoryId: filters.dormitoryId } : {}),
    ...(filters.recordId ? { recordId: filters.recordId } : {}),
    ...(filters.status ? { OR: [{ beforeStatus: filters.status }, { afterStatus: filters.status }] } : {}),
    dormitory: {
      ...(filters.roomNo ? { roomNo: { contains: filters.roomNo, mode: "insensitive" } } : {}),
      building: {
        ...(filters.buildingId ? { id: filters.buildingId } : {}),
        ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
      },
    },
  };
  return prisma.sweepAudit.findMany({
    include: {
      agent: { select: { id: true, name: true } },
      dormitory: { include: { building: { include: { school: { select: { id: true, name: true } } } } } },
      operator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    where,
  });
}
