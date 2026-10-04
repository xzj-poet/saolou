import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";

export type RecordExpectation = {
  expectedRecordId: string | null;
  expectedVersion: number | null;
};

export type CurrentRecordToken = {
  id: string;
  version: number;
};

export type RecordConflictReason = "CREATED" | "UPDATED" | "DELETED";

export type SweepRecordConflict = {
  dormitoryId: string;
  reason: RecordConflictReason;
  roomNo: string;
  currentRecord?: {
    id: string;
    note: string | null;
    status: "PENDING" | "COVERED";
    updatedAt: Date | string;
    version: number;
  };
};

export function detectRecordConflict(
  current: CurrentRecordToken | null,
  expectation: RecordExpectation,
): RecordConflictReason | null {
  if (expectation.expectedRecordId === null) {
    return current === null ? null : "CREATED";
  }
  if (current === null) return "DELETED";
  if (
    current.id !== expectation.expectedRecordId ||
    current.version !== expectation.expectedVersion
  ) {
    return "UPDATED";
  }
  return null;
}

export function recordLockKey(agentId: string, dormitoryId: string) {
  return `${agentId}:${dormitoryId}`;
}

export function sortRecordTargets<T extends { dormitoryId: string }>(
  targets: readonly T[],
): T[] {
  return [...targets].sort((left, right) =>
    left.dormitoryId.localeCompare(right.dormitoryId),
  );
}

export async function lockSweepRecord(
  tx: Prisma.TransactionClient,
  agentId: string,
  dormitoryId: string,
) {
  const lockKey = recordLockKey(agentId, dormitoryId);
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL AS locked
  `;
}

export function recordConflictError(conflicts: SweepRecordConflict[]) {
  return new ApiError(
    409,
    "RECORD_CONFLICT",
    "记录已被其他操作更新，请加载最新内容后确认",
    { conflicts },
  );
}
