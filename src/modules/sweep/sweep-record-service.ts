import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { assertAgentSchoolAccess } from "@/modules/campus/campus-read-service";
import { resolveQuickNoteSnapshot } from "@/modules/quick-notes/quick-note-service";
import {
  detectRecordConflict,
  lockSweepRecord,
  recordConflictError,
  sortRecordTargets,
  type RecordExpectation,
} from "@/modules/sweep/sweep-concurrency";
import { sweepRecordInputSchema } from "@/modules/sweep/sweep-schema";
import { deriveOverallStatus } from "@/modules/sweep/sweep-status";
import type { SweepOperator, SweepRecordInput } from "@/modules/sweep/sweep-types";

export type SweepBatchTarget = RecordExpectation & { dormitoryId: string };

export type SweepBatchInput = Omit<SweepRecordInput, "dormitoryId" | "expectedRecordId" | "expectedVersion"> & {
  buildingId: string;
  targets: SweepBatchTarget[];
};

async function validateTarget(input: SweepRecordInput, operator: SweepOperator) {
  const parsed = sweepRecordInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "请检查扫楼记录");
  if (operator.role === "AGENT" && operator.id !== parsed.data.agentId) {
    throw new ApiError(403, "RECORD_OWNERSHIP_DENIED", "代理只能修改自己的记录");
  }
  const [agent, dormitory] = await Promise.all([
    prisma.user.findFirst({ select: { id: true }, where: { id: parsed.data.agentId, role: "AGENT", status: "ACTIVE" } }),
    prisma.dormitory.findFirst({
      select: { building: { select: { isActive: true, school: { select: { id: true, isActive: true } } } }, id: true, isActive: true },
      where: { id: parsed.data.dormitoryId },
    }),
  ]);
  if (!agent) throw new ApiError(404, "AGENT_NOT_FOUND", "代理不存在或已停用");
  if (!dormitory?.isActive || !dormitory.building.isActive || !dormitory.building.school.isActive) {
    throw new ApiError(404, "DORMITORY_NOT_FOUND", "宿舍不存在或已停用");
  }
  if (operator.role === "AGENT") await assertAgentSchoolAccess(operator.id, dormitory.building.school.id);
  return parsed.data;
}

async function noteSnapshot(tx: Prisma.TransactionClient, input: SweepRecordInput) {
  if (input.quickNoteId) return resolveQuickNoteSnapshot({ quickNoteId: input.quickNoteId, status: input.status }, tx);
  const normalized = input.customNote?.trim() ?? "";
  return normalized.length ? normalized : null;
}

export async function writeLockedSweepRecord(
  tx: Prisma.TransactionClient,
  input: SweepRecordInput,
  operatorId: string,
) {
  const current = await tx.sweepRecord.findUnique({
    where: { agentId_dormitoryId: { agentId: input.agentId, dormitoryId: input.dormitoryId } },
  });
  const conflict = detectRecordConflict(current, input);
  if (conflict) {
    const { roomNo } = await tx.dormitory.findUniqueOrThrow({ select: { roomNo: true }, where: { id: input.dormitoryId } });
    throw recordConflictError([{
      ...(current ? { currentRecord: { id: current.id, note: current.note, status: current.status, updatedAt: current.updatedAt, version: current.version } } : {}),
      dormitoryId: input.dormitoryId,
      reason: conflict,
      roomNo,
    }]);
  }

  const note = await noteSnapshot(tx, input);

  if (!current) {
    const record = await tx.sweepRecord.create({ data: { agentId: input.agentId, dormitoryId: input.dormitoryId, note, status: input.status } });
    await tx.sweepAudit.create({ data: { action: "CREATE", afterNote: note, afterStatus: input.status, agentId: input.agentId, dormitoryId: input.dormitoryId, operatorId, recordId: record.id } });
    return { changed: true, record };
  }
  if (current.status === input.status && current.note === note) return { changed: false, record: current };

  const record = await tx.sweepRecord.update({ data: { note, status: input.status, version: { increment: 1 } }, where: { id: current.id } });
  await tx.sweepAudit.create({ data: { action: "UPDATE", afterNote: note, afterStatus: input.status, agentId: current.agentId, beforeNote: current.note, beforeStatus: current.status, dormitoryId: current.dormitoryId, operatorId, recordId: current.id } });
  return { changed: true, record };
}

export async function getDormitoryOverallStatus(dormitoryId: string) {
  const records = await prisma.sweepRecord.findMany({ select: { status: true }, where: { dormitoryId } });
  return deriveOverallStatus(records.map(({ status }) => status));
}

export async function upsertAgentRecord(input: SweepRecordInput, operator: SweepOperator) {
  const validated = await validateTarget(input, operator);
  const result = await prisma.$transaction(async (tx) => {
    await lockSweepRecord(tx, validated.agentId, validated.dormitoryId);
    return writeLockedSweepRecord(tx, validated, operator.id);
  });
  return { ...result, overallStatus: await getDormitoryOverallStatus(validated.dormitoryId) };
}

export async function upsertAgentRecordsBatch(input: SweepBatchInput, operator: SweepOperator) {
  if (operator.role !== "AGENT" || operator.id !== input.agentId) throw new ApiError(403, "RECORD_OWNERSHIP_DENIED", "代理只能修改自己的记录");
  if (!input.targets.length || input.targets.length > 100) throw new ApiError(400, "VALIDATION_ERROR", "批量宿舍数量无效");
  const targetByDormitory = new Map<string, SweepBatchTarget>();
  for (const target of input.targets) {
    if ((target.expectedRecordId === null) !== (target.expectedVersion === null)) {
      throw new ApiError(400, "VALIDATION_ERROR", "记录 ID 和版本必须同时提供或同时为空");
    }
    const existing = targetByDormitory.get(target.dormitoryId);
    if (existing && (existing.expectedRecordId !== target.expectedRecordId || existing.expectedVersion !== target.expectedVersion)) {
      throw new ApiError(400, "BATCH_TARGET_CONTRADICTORY", "同一宿舍不能提交互相矛盾的版本预期");
    }
    targetByDormitory.set(target.dormitoryId, target);
  }
  const targets = sortRecordTargets([...targetByDormitory.values()]);
  const dormitoryIds = targets.map(({ dormitoryId }) => dormitoryId);

  return prisma.$transaction(async (tx) => {
    const building = await tx.building.findFirst({ select: { id: true, school: { select: { id: true, isActive: true } } }, where: { id: input.buildingId, isActive: true } });
    if (!building?.school.isActive) throw new ApiError(404, "BUILDING_NOT_FOUND", "楼栋不存在或已停用");
    const access = await tx.agentSchoolAccess.findUnique({ select: { id: true }, where: { agentId_schoolId: { agentId: input.agentId, schoolId: building.school.id } } });
    if (!access) throw new ApiError(403, "SCHOOL_ACCESS_DENIED", "你没有访问该学校的权限");
    const dormitories = await tx.dormitory.findMany({ select: { id: true, roomNo: true }, where: { buildingId: input.buildingId, id: { in: dormitoryIds }, isActive: true } });
    if (dormitories.length !== dormitoryIds.length) throw new ApiError(400, "BATCH_TARGET_INVALID", "批量宿舍必须全部属于当前楼栋且处于启用状态");
    const roomNoById = new Map(dormitories.map((dormitory) => [dormitory.id, dormitory.roomNo]));

    for (const target of targets) await lockSweepRecord(tx, input.agentId, target.dormitoryId);
    const currentRecords = await tx.sweepRecord.findMany({
      where: { agentId: input.agentId, dormitoryId: { in: dormitoryIds } },
    });
    const currentByDormitory = new Map(currentRecords.map((record) => [record.dormitoryId, record]));
    const conflicts = targets.flatMap((target) => {
      const current = currentByDormitory.get(target.dormitoryId) ?? null;
      const reason = detectRecordConflict(current, target);
      return reason ? [{
        ...(current ? { currentRecord: { id: current.id, note: current.note, status: current.status, updatedAt: current.updatedAt, version: current.version } } : {}),
        dormitoryId: target.dormitoryId,
        reason,
        roomNo: roomNoById.get(target.dormitoryId)!,
      }] : [];
    });
    if (conflicts.length) throw recordConflictError(conflicts);

    const changes: Array<Awaited<ReturnType<typeof writeLockedSweepRecord>>> = [];
    for (const target of targets) {
      changes.push(await writeLockedSweepRecord(tx, { agentId: input.agentId, customNote: input.customNote, ...target, quickNoteId: input.quickNoteId, status: input.status }, operator.id));
    }
    const buildingDormitories = await tx.dormitory.findMany({
      select: { id: true, sweepRecords: { select: { status: true } } },
      where: { buildingId: input.buildingId, isActive: true },
    });
    const statusById = new Map(buildingDormitories.map((row) => [row.id, deriveOverallStatus(row.sweepRecords.map(({ status }) => status))]));
    const counts = { covered: 0, pending: 0, unvisited: 0 };
    for (const status of statusById.values()) counts[status === "COVERED" ? "covered" : status === "PENDING" ? "pending" : "unvisited"] += 1;
    return {
      counts,
      results: targets.map(({ dormitoryId }, index) => ({ changed: changes[index].changed, dormitoryId, overallStatus: statusById.get(dormitoryId) })),
    };
  });
}
