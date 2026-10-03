import type { SweepStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { quickNoteContentSchema } from "@/modules/quick-notes/quick-note-schema";

const orderBy = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];
type QuickNoteReader = Pick<typeof prisma, "quickNote">;

function validatedContent(content: string) {
  const parsed = quickNoteContentSchema.safeParse(content);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "请检查快捷备注");
  }
  return parsed.data;
}

async function assertUniqueContent(status: SweepStatus, content: string, excludeId?: string) {
  const duplicate = await prisma.quickNote.findFirst({
    select: { id: true },
    where: { content, status, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (duplicate) throw new ApiError(409, "QUICK_NOTE_CONFLICT", "当前分组已有相同快捷备注");
}

async function requireQuickNote(id: string) {
  const quickNote = await prisma.quickNote.findUnique({ where: { id } });
  if (!quickNote) throw new ApiError(404, "QUICK_NOTE_NOT_FOUND", "快捷备注不存在");
  return quickNote;
}

export async function listActiveQuickNotes(status: SweepStatus) {
  return prisma.quickNote.findMany({ orderBy, where: { isActive: true, status } });
}

export async function listQuickNotesForAdmin() {
  return prisma.quickNote.findMany({ orderBy: [{ status: "asc" }, ...orderBy] });
}

export async function createQuickNote(input: { content: string; status: SweepStatus }) {
  const content = validatedContent(input.content);
  await assertUniqueContent(input.status, content);
  const last = await prisma.quickNote.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true }, where: { status: input.status } });
  return prisma.quickNote.create({ data: { content, sortOrder: (last?.sortOrder ?? -1) + 1, status: input.status } });
}

export async function updateQuickNote(id: string, input: { content?: string; isActive?: boolean }) {
  const current = await requireQuickNote(id);
  const content = input.content === undefined ? current.content : validatedContent(input.content);
  if (content !== current.content) await assertUniqueContent(current.status, content, id);
  return prisma.quickNote.update({
    data: { ...(input.content !== undefined ? { content } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    where: { id },
  });
}

export async function setQuickNoteActive(id: string, isActive: boolean) {
  return updateQuickNote(id, { isActive });
}

export async function deleteQuickNote(id: string) {
  const current = await requireQuickNote(id);
  await prisma.$transaction(async (tx) => {
    await tx.quickNote.delete({ where: { id } });
    const remaining = await tx.quickNote.findMany({ orderBy, select: { id: true }, where: { status: current.status } });
    await Promise.all(remaining.map((note, index) => tx.quickNote.update({ data: { sortOrder: index }, where: { id: note.id } })));
  });
  return { deleted: true };
}

export async function reorderQuickNotes(status: SweepStatus, orderedIds: string[]) {
  const notes = await prisma.quickNote.findMany({ orderBy, select: { id: true }, where: { status } });
  const currentIds = notes.map(({ id }) => id);
  if (orderedIds.length !== currentIds.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !currentIds.includes(id))) {
    throw new ApiError(400, "QUICK_NOTE_ORDER_INVALID", "快捷备注排序内容无效");
  }
  await prisma.$transaction(orderedIds.map((id, index) => prisma.quickNote.update({ data: { sortOrder: index }, where: { id } })));
  return prisma.quickNote.findMany({ orderBy, where: { status } });
}

export async function resolveQuickNoteSnapshot(input: { quickNoteId: string; status: SweepStatus }, db: QuickNoteReader = prisma) {
  const note = await db.quickNote.findFirst({ select: { content: true }, where: { id: input.quickNoteId, isActive: true, status: input.status } });
  if (!note) throw new ApiError(400, "QUICK_NOTE_INVALID", "快捷备注已失效或与当前状态不匹配");
  return note.content;
}
