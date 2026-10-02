import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createSchoolRoute } from "@/app/api/admin/schools/route";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/auth/session-repository";

const origin = "http://localhost";
const prefix = "campus-route-";
let adminCookie = "";
let agentCookie = "";

function request(body: unknown, cookie: string) {
  return new Request(`${origin}/api/admin/schools`, {
    body: JSON.stringify(body),
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
    method: "POST",
  });
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      name: "管理员",
      passwordHash: "test-only-hash",
      role: "ADMIN",
      username: `${prefix}admin-${randomUUID()}`,
    },
  });
  const agent = await prisma.user.create({
    data: {
      name: "代理",
      passwordHash: "test-only-hash",
      role: "AGENT",
      username: `${prefix}agent-${randomUUID()}`,
    },
  });
  adminCookie = `campus_sweep_session=${(await createSession(admin.id)).token}`;
  agentCookie = `campus_sweep_session=${(await createSession(agent.id)).token}`;
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { startsWith: prefix } },
  });
  const schools = await prisma.school.findMany({
    select: { id: true },
    where: { name: { startsWith: prefix } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: users.map(({ id }) => id) } } });
  await prisma.school.deleteMany({ where: { id: { in: schools.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
});

describe("administrator campus routes", () => {
  it("creates a normalized school for an administrator", async () => {
    const name = `${prefix}${randomUUID()}`;
    const response = await createSchoolRoute(request({ name: ` ${name} ` }, adminCookie));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ school: { name } });
  });

  it("rejects agent access without making changes", async () => {
    const name = `${prefix}${randomUUID()}`;
    const response = await createSchoolRoute(request({ name }, agentCookie));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    await expect(prisma.school.findUnique({ where: { name } })).resolves.toBeNull();
  });

  it("rejects forged identity fields and foreign origins", async () => {
    const forged = await createSchoolRoute(
      request(
        { agentId: randomUUID(), name: `${prefix}${randomUUID()}`, role: "ADMIN" },
        adminCookie,
      ),
    );
    const foreign = await createSchoolRoute(
      new Request(`${origin}/api/admin/schools`, {
        body: JSON.stringify({ name: `${prefix}${randomUUID()}` }),
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
          Origin: "https://evil.example.com",
        },
        method: "POST",
      }),
    );

    expect(forged.status).toBe(400);
    expect(foreign.status).toBe(403);
  });
});
