import { z } from "zod";

export const sweepRecordInputSchema = z.object({
  agentId: z.uuid(),
  customNote: z.string().trim().max(60, "备注最多 60 个字").optional().nullable(),
  dormitoryId: z.uuid(),
  quickNoteId: z.uuid().optional(),
  status: z.enum(["PENDING", "COVERED"]),
}).strict().refine((value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null), {
  message: "快捷备注和自定义备注只能选择一种",
});

const writeFields = {
  customNote: z.string().trim().max(60, "备注最多 60 个字").optional().nullable(),
  quickNoteId: z.uuid().optional(),
  status: z.enum(["PENDING", "COVERED"]),
};

export const sweepWriteBodySchema = z.object(writeFields).strict().refine(
  (value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null),
  { message: "快捷备注和自定义备注只能选择一种" },
);

export const sweepBatchBodySchema = z.object({
  ...writeFields,
  buildingId: z.uuid(),
  dormitoryIds: z.array(z.uuid()).min(1, "至少选择一间宿舍").max(100, "一次最多标记 100 间宿舍"),
}).strict().refine(
  (value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null),
  { message: "快捷备注和自定义备注只能选择一种" },
);
