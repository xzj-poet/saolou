import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listAgentNotes } from "@/app/api/quick-notes/route";
import { GET as listAdminNotes, POST as createAdminNote } from "@/app/api/admin/quick-notes/route";
import { DELETE as deleteAdminNote, PATCH as updateAdminNote } from "@/app/api/admin/quick-notes/[quickNoteId]/route";
import { PUT as reorderAdminNotes } from "@/app/api/admin/quick-notes/reorder/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const origin = "http://localhost";
const prefix = "quick-note-route-";
let adminCookie = "";
let agentCookie = "";

function writeRequest(path: string, body: unknown, cookie: string, method: string) {
  return new Request(`${origin}${path}`, {
    body: JSON.stringify(body),
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
    method,
  });
}

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "test", role: "ADMIN", username: `${prefix}admin-${randomUUID()}` } });
  const agent = await prisma.user.create({ data: { name: "代理", passwordHash: "test", role: "AGENT", username: `${prefix}agent-${randomUUID()}` } });
  adminCookie = `campus_sweep_session=${(await createSession(admin.id)).token}`;
  agentCookie = `campus_sweep_session=${(await createSession(agent.id)).token}`;
});

afterAll(async () => {
  await prisma.quickNote.deleteMany({ where: { content: { startsWith: prefix } } });
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const ids = users.map(({ id }) => id);
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("quick note routes", () => {
  it("lets an administrator create, update, reorder, list, and delete notes", async () => {
    const oneContent = `${prefix}one-${randomUUID().slice(0, 8)}`;
    const twoContent = `${prefix}two-${randomUUID().slice(0, 8)}`;
    const createOne = await createAdminNote(writeRequest("/api/admin/quick-notes", { content: oneContent, status: "PENDING" }, adminCookie, "POST"));
    const createTwo = await createAdminNote(writeRequest("/api/admin/quick-notes", { content: twoContent, status: "PENDING" }, adminCookie, "POST"));
    const one = (await createOne.json()).quickNote;
    const two = (await createTwo.json()).quickNote;
    expect(createOne.status).toBe(201);

    const update = await updateAdminNote(
      writeRequest(`/api/admin/quick-notes/${one.id}`, { content: `${oneContent}-edited`, isActive: false }, adminCookie, "PATCH"),
      { params: Promise.resolve({ quickNoteId: one.id }) },
    );
    expect(update.status).toBe(200);
    const reorder = await reorderAdminNotes(writeRequest("/api/admin/quick-notes/reorder", { orderedIds: [two.id, one.id], status: "PENDING" }, adminCookie, "PUT"));
    expect(reorder.status).toBe(200);

    const adminList = await listAdminNotes(new Request(`${origin}/api/admin/quick-notes`, { headers: { Cookie: adminCookie } }));
    expect((await adminList.json()).quickNotes.filter((note: { id: string }) => [one.id, two.id].includes(note.id)).map((note: { id: string }) => note.id)).toEqual([two.id, one.id]);
    const agentList = await listAgentNotes(new Request(`${origin}/api/quick-notes?status=PENDING`, { headers: { Cookie: agentCookie } }));
    expect((await agentList.json()).quickNotes.map((note: { id: string }) => note.id)).toContain(two.id);
    expect((await (await listAgentNotes(new Request(`${origin}/api/quick-notes?status=PENDING`, { headers: { Cookie: agentCookie } }))).json()).quickNotes.map((note: { id: string }) => note.id)).not.toContain(one.id);

    const removed = await deleteAdminNote(new Request(`${origin}/api/admin/quick-notes/${one.id}`, { headers: { Cookie: adminCookie, Origin: origin }, method: "DELETE" }), { params: Promise.resolve({ quickNoteId: one.id }) });
    expect(removed.status).toBe(200);
  });

  it("rejects agents, forged fields, and foreign origins on administrator writes", async () => {
    const content = `${prefix}${randomUUID()}`;
    const denied = await createAdminNote(writeRequest("/api/admin/quick-notes", { content, status: "PENDING" }, agentCookie, "POST"));
    const forged = await createAdminNote(writeRequest("/api/admin/quick-notes", { content, role: "ADMIN", status: "PENDING" }, adminCookie, "POST"));
    const foreign = await createAdminNote(new Request(`${origin}/api/admin/quick-notes`, { body: JSON.stringify({ content, status: "PENDING" }), headers: { Cookie: adminCookie, "Content-Type": "application/json", Origin: "https://evil.example.com" }, method: "POST" }));

    expect(denied.status).toBe(403);
    expect(forged.status).toBe(400);
    expect(foreign.status).toBe(403);
  });
});
