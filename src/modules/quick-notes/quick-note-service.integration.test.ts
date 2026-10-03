import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import {
  createQuickNote,
  deleteQuickNote,
  listActiveQuickNotes,
  listQuickNotesForAdmin,
  reorderQuickNotes,
  resolveQuickNoteSnapshot,
  setQuickNoteActive,
  updateQuickNote,
} from "@/modules/quick-notes/quick-note-service";

const prefix = "quick-note-test-";

afterEach(async () => {
  await prisma.quickNote.deleteMany({ where: { content: { startsWith: prefix } } });
});

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error("Expected ApiError.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("quick note service", () => {
  it("normalizes content, appends within a status group, and lists active notes in order", async () => {
    const suffix = randomUUID();
    const first = await createQuickNote({ content: `  ${prefix}first-${suffix}  `, status: "PENDING" });
    const second = await createQuickNote({ content: `${prefix}second-${suffix}`, status: "PENDING" });
    const covered = await createQuickNote({ content: `${prefix}covered-${suffix}`, status: "COVERED" });

    expect(first).toMatchObject({ content: `${prefix}first-${suffix}`, sortOrder: 0 });
    expect(second.sortOrder).toBe(1);
    await setQuickNoteActive(second.id, false);

    await expect(listActiveQuickNotes("PENDING")).resolves.toEqual([
      expect.objectContaining({ id: first.id, content: `${prefix}first-${suffix}` }),
    ]);
    await expect(listQuickNotesForAdmin()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: second.id, isActive: false, status: "PENDING" }),
      expect.objectContaining({ id: covered.id, status: "COVERED" }),
    ]));
  });

  it("rejects blank, overlong, and duplicate content within the same status", async () => {
    const content = `${prefix}${randomUUID()}`;
    await createQuickNote({ content, status: "PENDING" });

    await expectApiError(createQuickNote({ content: "   ", status: "PENDING" }), 400, "VALIDATION_ERROR");
    await expectApiError(createQuickNote({ content: "x".repeat(61), status: "PENDING" }), 400, "VALIDATION_ERROR");
    await expectApiError(createQuickNote({ content, status: "PENDING" }), 409, "QUICK_NOTE_CONFLICT");
    await expect(createQuickNote({ content, status: "COVERED" })).resolves.toMatchObject({ content });
  });

  it("edits, reorders, toggles, deletes, and resolves only active matching snapshots", async () => {
    const suffix = randomUUID();
    const first = await createQuickNote({ content: `${prefix}one-${suffix}`, status: "PENDING" });
    const second = await createQuickNote({ content: `${prefix}two-${suffix}`, status: "PENDING" });
    const covered = await createQuickNote({ content: `${prefix}covered-${suffix}`, status: "COVERED" });

    await updateQuickNote(first.id, { content: `${prefix}edited-${suffix}` });
    await reorderQuickNotes("PENDING", [second.id, first.id]);
    expect((await listActiveQuickNotes("PENDING")).map(({ id }) => id)).toEqual([second.id, first.id]);
    await expect(resolveQuickNoteSnapshot({ quickNoteId: first.id, status: "PENDING" })).resolves.toBe(`${prefix}edited-${suffix}`);
    await expectApiError(resolveQuickNoteSnapshot({ quickNoteId: first.id, status: "COVERED" }), 400, "QUICK_NOTE_INVALID");
    await expectApiError(reorderQuickNotes("PENDING", [first.id, covered.id]), 400, "QUICK_NOTE_ORDER_INVALID");

    await setQuickNoteActive(first.id, false);
    await expectApiError(resolveQuickNoteSnapshot({ quickNoteId: first.id, status: "PENDING" }), 400, "QUICK_NOTE_INVALID");
    await deleteQuickNote(first.id);
    await expect(prisma.quickNote.findUnique({ where: { id: first.id } })).resolves.toBeNull();
  });
});
