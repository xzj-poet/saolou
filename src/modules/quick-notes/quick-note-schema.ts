import { z } from "zod";

export const quickNoteStatusSchema = z.enum(["PENDING", "COVERED"]);
export const quickNoteContentSchema = z.string().trim().min(1, "快捷备注不能为空").max(60, "快捷备注最多 60 个字");

export const quickNoteCreateSchema = z.object({
  content: quickNoteContentSchema,
  status: quickNoteStatusSchema,
}).strict();

export const quickNoteUpdateSchema = z.object({
  content: quickNoteContentSchema.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => value.content !== undefined || value.isActive !== undefined, {
  message: "至少提供一个需要修改的字段",
});

export const quickNoteReorderSchema = z.object({
  orderedIds: z.array(z.uuid()),
  status: quickNoteStatusSchema,
}).strict();
