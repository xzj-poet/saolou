import { z } from "zod";

const trimmedName = z.string().trim().min(1, "名称不能为空").max(100, "名称最多 100 个字");
const optionalNote = z
  .string()
  .trim()
  .max(500, "备注最多 500 个字")
  .optional()
  .nullable();

export const schoolCreateSchema = z.object({ name: trimmedName }).strict();
export const schoolUpdateSchema = z.object({ name: trimmedName }).strict();
export const activeStatusSchema = z.object({ isActive: z.boolean() }).strict();

export const buildingCreateSchema = z
  .object({ name: trimmedName, note: optionalNote, schoolId: z.uuid() })
  .strict();
export const buildingUpdateSchema = z
  .object({ name: trimmedName.optional(), note: optionalNote })
  .strict()
  .refine((value) => value.name !== undefined || value.note !== undefined, {
    message: "至少提供一个需要修改的字段",
  });

export const dormitoryCreateSchema = z
  .object({
    buildingId: z.uuid(),
    floor: z.string().trim().min(1, "楼层不能为空").max(20),
    roomNo: z.string().trim().min(1, "宿舍号不能为空").max(30),
  })
  .strict();

export const dormitoryRangeSchema = z
  .object({
    floorEnd: z.number().int(),
    floorStart: z.number().int(),
    roomEnd: z.number().int(),
    roomStart: z.number().int(),
  })
  .strict();

export const dormitoryBatchSchema = z
  .object({
    action: z.enum(["preview", "create"]),
    range: dormitoryRangeSchema,
  })
  .strict();

export const dormitoryRetireSchema = z
  .object({ dormitoryIds: z.array(z.uuid()).min(1, "至少选择一间宿舍") })
  .strict();
