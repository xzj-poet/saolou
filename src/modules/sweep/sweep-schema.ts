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
