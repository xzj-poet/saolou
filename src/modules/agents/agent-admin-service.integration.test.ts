import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { verifyPassword } from "@/modules/auth/password";
import { createSession, resolveSession } from "@/modules/auth/session-repository";
import {
  createAgent,
  listAgentsForAdmin,
  renameAgent,
  replaceAgentSchoolAccess,
  resetAgentPassword,
  setAgentStatus,
} from "@/modules/agents/agent-admin-service";

const prefix = "agent-admin-";

afterEach(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } });
  const userIds = users.map(({ id }) => id);
  const schoolIds = schools.map(({ id }) => id);
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function createAdmin() {
  const id = randomUUID();
  return prisma.user.create({ data: { id, name: "管理员", passwordHash: "test-only-hash", role: "ADMIN", username: `${prefix}admin-${id}` } });
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try { await promise; throw new Error("Expected ApiError."); } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("agent administration service", () => {
  it("creates a normalized unique agent with a one-time password and lists it", async () => {
    const admin = await createAdmin();
    const username = `${prefix}${randomUUID()}`;
    const result = await createAgent(admin.id, { name: " 张三 ", username: ` ${username.toUpperCase()} ` });

    expect(result.temporaryPassword).toHaveLength(16);
    expect(result.agent).toMatchObject({ name: "张三", role: "AGENT", username });
    expect(await verifyPassword(result.temporaryPassword, result.agent.passwordHash)).toBe(true);
    await expectApiError(createAgent(admin.id, { name: "重复", username }), 409, "USERNAME_CONFLICT");
    await expect(listAgentsForAdmin()).resolves.toEqual([
      expect.objectContaining({ id: result.agent.id, name: "张三", schools: [], status: "ACTIVE", username }),
    ]);
  });

  it("renames, disables, and enables without losing school access while revoking sessions", async () => {
    const admin = await createAdmin();
    const school = await prisma.school.create({ data: { name: `${prefix}${randomUUID()}` } });
    const { agent } = await createAgent(admin.id, { name: "张三", username: `${prefix}${randomUUID()}` });
    await replaceAgentSchoolAccess(agent.id, [school.id], admin.id);
    const session = await createSession(agent.id);

    await renameAgent(agent.id, { name: " 李四 " });
    await setAgentStatus(agent.id, "DISABLED");

    expect(await resolveSession(session.token)).toBeNull();
    expect(await prisma.agentSchoolAccess.count({ where: { agentId: agent.id } })).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: agent.id } })).toMatchObject({ name: "李四", status: "DISABLED" });
    await setAgentStatus(agent.id, "ACTIVE");
    expect(await prisma.user.findUnique({ where: { id: agent.id } })).toMatchObject({ status: "ACTIVE" });
  });

  it("resets the password, revokes sessions, and returns plaintext only from the operation", async () => {
    const admin = await createAdmin();
    const created = await createAgent(admin.id, { name: "张三", username: `${prefix}${randomUUID()}` });
    const session = await createSession(created.agent.id);

    const reset = await resetAgentPassword(created.agent.id);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.agent.id } });

    expect(reset.temporaryPassword).toHaveLength(16);
    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
    expect(await verifyPassword(reset.temporaryPassword, stored.passwordHash)).toBe(true);
    expect(await resolveSession(session.token)).toBeNull();
    expect(JSON.stringify(stored)).not.toContain(reset.temporaryPassword);
  });

  it("overwrites the complete active-school set, allows zero access, and rejects invalid sets", async () => {
    const admin = await createAdmin();
    const activeOne = await prisma.school.create({ data: { name: `${prefix}${randomUUID()}-one` } });
    const activeTwo = await prisma.school.create({ data: { name: `${prefix}${randomUUID()}-two` } });
    const inactive = await prisma.school.create({ data: { isActive: false, name: `${prefix}${randomUUID()}-inactive` } });
    const { agent } = await createAgent(admin.id, { name: "张三", username: `${prefix}${randomUUID()}` });

    await replaceAgentSchoolAccess(agent.id, [activeOne.id], admin.id);
    await Promise.all([
      replaceAgentSchoolAccess(agent.id, [activeOne.id, activeTwo.id], admin.id),
      replaceAgentSchoolAccess(agent.id, [activeOne.id, activeTwo.id], admin.id),
    ]);
    expect(await prisma.agentSchoolAccess.findMany({ where: { agentId: agent.id } })).toHaveLength(2);
    await prisma.school.update({ data: { isActive: false }, where: { id: activeOne.id } });
    await replaceAgentSchoolAccess(agent.id, [activeOne.id, activeTwo.id], admin.id);
    expect(await prisma.agentSchoolAccess.findMany({ where: { agentId: agent.id } })).toHaveLength(2);
    await replaceAgentSchoolAccess(agent.id, [activeTwo.id], admin.id);
    await expect(prisma.agentSchoolAccess.findUnique({
      where: { agentId_schoolId: { agentId: agent.id, schoolId: activeOne.id } },
    })).resolves.toBeNull();
    await replaceAgentSchoolAccess(agent.id, [], admin.id);
    expect(await prisma.agentSchoolAccess.count({ where: { agentId: agent.id } })).toBe(0);
    await expectApiError(replaceAgentSchoolAccess(agent.id, [activeOne.id, activeOne.id], admin.id), 400, "DUPLICATE_SCHOOL_IDS");
    await expectApiError(replaceAgentSchoolAccess(agent.id, [inactive.id], admin.id), 400, "INVALID_SCHOOL_ACCESS");
    await expectApiError(replaceAgentSchoolAccess(agent.id, [randomUUID()], admin.id), 400, "INVALID_SCHOOL_ACCESS");
  });
});
