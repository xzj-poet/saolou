import type { SweepStatus, UserRole } from "@/generated/prisma/client";

export type SweepOperator = { id: string; role: UserRole };

export type SweepRecordInput = {
  agentId: string;
  customNote?: string | null;
  dormitoryId: string;
  quickNoteId?: string;
  status: SweepStatus;
};
