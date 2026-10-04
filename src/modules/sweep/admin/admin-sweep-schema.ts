import { z } from "zod";

const optionalUuid = z.uuid().optional();

export const sweepRecordFiltersSchema = z.object({
  agentId: optionalUuid,
  buildingId: optionalUuid,
  roomNo: z.string().trim().max(30).optional(),
  schoolId: optionalUuid,
  status: z.enum(["PENDING", "COVERED"]).optional(),
}).strict();

export const sweepAuditFiltersSchema = sweepRecordFiltersSchema.extend({
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  dormitoryId: optionalUuid,
  recordId: optionalUuid,
});

export const adminSweepUpdateSchema = z.object({
  customNote: z.string().trim().max(60, "备注最多 60 个字").nullable().optional(),
  expectedRecordId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  status: z.enum(["PENDING", "COVERED"]),
}).strict();

export const adminSweepDeleteSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict();
