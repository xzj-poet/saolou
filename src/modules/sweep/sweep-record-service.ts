import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { assertAgentSchoolAccess } from "@/modules/campus/campus-read-service";
import { resolveQuickNoteSnapshot } from "@/modules/quick-notes/quick-note-service";
import { sweepRecordInputSchema } from "@/modules/sweep/sweep-schema";
import { deriveOverallStatus } from "@/modules/sweep/sweep-status";
import type { SweepOperator, SweepRecordInput } from "@/modules/sweep/sweep-types";

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

export async function upsertRecordInTransaction(
  tx: Prisma.TransactionClient,
  input: SweepRecordInput,
  operatorId: string,
) {
  const lockKey = `${input.agentId}:${input.dormitoryId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL AS locked`;
  const note = await noteSnapshot(tx, input);
  const current = await tx.sweepRecord.findUnique({ where: { agentId_dormitoryId: { agentId: input.agentId, dormitoryId: input.dormitoryId } } });

  if (!current) {
    const record = await tx.sweepRecord.create({ data: { agentId: input.agentId, dormitoryId: input.dormitoryId, note, status: input.status } });
    await tx.sweepAudit.create({ data: { action: "CREATE", afterNote: note, afterStatus: input.status, agentId: input.agentId, dormitoryId: input.dormitoryId, operatorId, recordId: record.id } });
    return { changed: true, record };
  }
  if (current.status === input.status && current.note === note) return { changed: false, record: current };

  const record = await tx.sweepRecord.update({ data: { note, status: input.status }, where: { id: current.id } });
  await tx.sweepAudit.create({ data: { action: "UPDATE", afterNote: note, afterStatus: input.status, agentId: current.agentId, beforeNote: current.note, beforeStatus: current.status, dormitoryId: current.dormitoryId, operatorId, recordId: current.id } });
  return { changed: true, record };
}

export async function getDormitoryOverallStatus(dormitoryId: string) {
  const records = await prisma.sweepRecord.findMany({ select: { status: true }, where: { dormitoryId } });
  return deriveOverallStatus(records.map(({ status }) => status));
}

export async function upsertAgentRecord(input: SweepRecordInput, operator: SweepOperator) {
  const validated = await validateTarget(input, operator);
  const result = await prisma.$transaction((tx) => upsertRecordInTransaction(tx, validated, operator.id));
  return { ...result, overallStatus: await getDormitoryOverallStatus(validated.dormitoryId) };
}
