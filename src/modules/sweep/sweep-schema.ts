import { z } from "zod";

const expectationFields = {
  expectedRecordId: z.uuid().nullable(),
  expectedVersion: z.number().int().min(1).nullable(),
};

function hasPairedExpectation(value: {
  expectedRecordId: string | null;
  expectedVersion: number | null;
}) {
  return (value.expectedRecordId === null) === (value.expectedVersion === null);
}

export const sweepRecordInputSchema = z.object({
  agentId: z.uuid(),
  customNote: z.string().trim().max(60, "备注最多 60 个字").optional().nullable(),
  dormitoryId: z.uuid(),
  ...expectationFields,
  quickNoteId: z.uuid().optional(),
  status: z.enum(["PENDING", "COVERED"]),
}).strict().refine((value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null), {
  message: "快捷备注和自定义备注只能选择一种",
}).refine(hasPairedExpectation, {
  message: "记录 ID 和版本必须同时提供或同时为空",
  path: ["expectedVersion"],
});

const writeFields = {
  customNote: z.string().trim().max(60, "备注最多 60 个字").optional().nullable(),
  ...expectationFields,
  quickNoteId: z.uuid().optional(),
  status: z.enum(["PENDING", "COVERED"]),
};

export const sweepWriteBodySchema = z.object(writeFields).strict().refine(
  (value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null),
  { message: "快捷备注和自定义备注只能选择一种" },
).refine(hasPairedExpectation, {
  message: "记录 ID 和版本必须同时提供或同时为空",
  path: ["expectedVersion"],
});

export const sweepBatchBodySchema = z.object({
  customNote: writeFields.customNote,
  quickNoteId: writeFields.quickNoteId,
  status: writeFields.status,
  buildingId: z.uuid(),
  targets: z.array(z.object({
    dormitoryId: z.uuid(),
    ...expectationFields,
  }).strict().refine(hasPairedExpectation, {
    message: "记录 ID 和版本必须同时提供或同时为空",
    path: ["expectedVersion"],
  })).min(1, "至少选择一间宿舍").max(100, "一次最多标记 100 间宿舍"),
}).strict().refine(
  (value) => !(value.quickNoteId && value.customNote !== undefined && value.customNote !== null),
  { message: "快捷备注和自定义备注只能选择一种" },
);
