import type { SweepStatus, UserRole } from "@/generated/prisma/client";
import type { RecordExpectation } from "@/modules/sweep/sweep-concurrency";

export type SweepOperator = { id: string; role: UserRole };

export type SweepRecordInput = RecordExpectation & {
  agentId: string;
  customNote?: string | null;
  dormitoryId: string;
  quickNoteId?: string;
  status: SweepStatus;
};
