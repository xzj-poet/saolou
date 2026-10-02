import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createAgentRoute } from "@/app/api/admin/agents/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const prefix = "agent-route-";
const origin = "http://localhost";
let adminCookie = "";
let agentCookie = "";

function post(body: unknown, cookie: string) {
  return new Request(`${origin}/api/admin/agents`, {
    body: JSON.stringify(body),
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
    method: "POST",
  });
}

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "test-only-hash", role: "ADMIN", username: `${prefix}admin-${randomUUID()}` } });
  const agent = await prisma.user.create({ data: { name: "代理", passwordHash: "test-only-hash", role: "AGENT", username: `${prefix}actor-${randomUUID()}` } });
  adminCookie = `campus_sweep_session=${(await createSession(admin.id)).token}`;
  agentCookie = `campus_sweep_session=${(await createSession(agent.id)).token}`;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { userId: { in: users.map(({ id }) => id) } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { agentId: { in: users.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
});

describe("administrator agent routes", () => {
  it("creates an agent and returns the generated password only in this response", async () => {
    const username = `${prefix}${randomUUID()}`;
    const response = await createAgentRoute(post({ name: "张三", username }, adminCookie));
    const payload = await response.json() as { agent: { id: string }; temporaryPassword: string };

    expect(response.status).toBe(201);
    expect(payload.temporaryPassword).toHaveLength(16);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: payload.agent.id } });
    expect(JSON.stringify(stored)).not.toContain(payload.temporaryPassword);
  });

  it("rejects an agent role and forged identity fields without creating accounts", async () => {
    const forbiddenUsername = `${prefix}${randomUUID()}`;
    const forbidden = await createAgentRoute(post({ name: "越权", username: forbiddenUsername }, agentCookie));
    const forged = await createAgentRoute(post({ agentId: randomUUID(), name: "伪造", role: "ADMIN", username: `${prefix}${randomUUID()}` }, adminCookie));

    expect(forbidden.status).toBe(403);
    expect(forged.status).toBe(400);
    await expect(prisma.user.findUnique({ where: { username: forbiddenUsername } })).resolves.toBeNull();
  });
});
