import type { AuditAction, Prisma, SweepStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { detectRecordConflict, lockSweepRecord, recordConflictError } from "@/modules/sweep/sweep-concurrency";
import { writeLockedSweepRecord } from "@/modules/sweep/sweep-record-service";

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

type AdminSweepUpdateInput = { customNote?: string | null; expectedRecordId: string; expectedVersion: number; status: SweepStatus };
type AdminCurrentRecord = Prisma.SweepRecordGetPayload<{ include: { dormitory: { select: { roomNo: true } } } }>;

function deletedAdminRecordConflict(recordId: string) {
  return new ApiError(409, "RECORD_CONFLICT", "记录已被其他操作删除，请刷新后确认", {
    conflicts: [{ expectedRecordId: recordId, reason: "DELETED" }],
  });
}

function currentAdminConflict(record: AdminCurrentRecord | null, expectedRecordId: string, expectedVersion: number) {
  if (!record) return deletedAdminRecordConflict(expectedRecordId);
  const reason = detectRecordConflict(record, { expectedRecordId, expectedVersion });
  if (!reason) return null;
  return recordConflictError([{
    currentRecord: { id: record.id, note: record.note, status: record.status, updatedAt: record.updatedAt, version: record.version },
    dormitoryId: record.dormitoryId,
    reason,
    roomNo: record.dormitory.roomNo,
  }]);
}

export async function updateSweepRecordAsAdmin(recordId: string, input: AdminSweepUpdateInput, adminId: string) {
  if (input.expectedRecordId !== recordId) throw new ApiError(400, "VALIDATION_ERROR", "记录 ID 与请求路径不一致");
  const located = await prisma.sweepRecord.findUnique({ select: { agentId: true, dormitoryId: true }, where: { id: recordId } });
  if (!located) throw deletedAdminRecordConflict(recordId);
  return prisma.$transaction(async (tx) => {
    await lockSweepRecord(tx, located.agentId, located.dormitoryId);
    const current = await tx.sweepRecord.findUnique({ include: { dormitory: { select: { roomNo: true } } }, where: { agentId_dormitoryId: located } });
    const conflict = currentAdminConflict(current, recordId, input.expectedVersion);
    if (conflict) throw conflict;
    return writeLockedSweepRecord(tx, { ...input, agentId: located.agentId, dormitoryId: located.dormitoryId }, adminId);
  });
}

export async function deleteSweepRecordAsAdmin(recordId: string, expectedVersion: number, adminId: string) {
  const located = await prisma.sweepRecord.findUnique({ select: { agentId: true, dormitoryId: true }, where: { id: recordId } });
  if (!located) throw deletedAdminRecordConflict(recordId);
  return prisma.$transaction(async (tx) => {
    await lockSweepRecord(tx, located.agentId, located.dormitoryId);
    const record = await tx.sweepRecord.findUnique({ include: { dormitory: { select: { roomNo: true } } }, where: { agentId_dormitoryId: located } });
    const conflict = currentAdminConflict(record, recordId, expectedVersion);
    if (conflict) throw conflict;
    if (!record) throw deletedAdminRecordConflict(recordId);
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
