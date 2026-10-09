import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { changePendingAgentPassword } from "@/modules/auth/change-password-service";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { createSession, resolveSession } from "@/modules/auth/session-repository";

const prefix = "change-password-";

afterEach(async () => {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { startsWith: prefix } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: users.map(({ id }) => id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
});

async function createAgent(mustChangePassword: boolean) {
  const username = `${prefix}${randomUUID()}`;
  return prisma.user.create({
    data: {
      mustChangePassword,
      name: "待改密代理",
      passwordHash: await hashPassword("temporary-password"),
      role: "AGENT",
      username,
    },
  });
}

describe("pending agent password changes", () => {
  it("replaces a temporary password and clears the pending state", async () => {
    const agent = await createAgent(true);
    const currentSession = await createSession(agent.id);
    const otherSession = await createSession(agent.id);

    await changePendingAgentPassword(
      { id: agent.id, mustChangePassword: true, name: agent.name, role: "AGENT", username: agent.username },
      "abcdef",
      currentSession.token,
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(stored.mustChangePassword).toBe(false);
    await expect(verifyPassword("temporary-password", stored.passwordHash)).resolves.toBe(false);
    await expect(verifyPassword("abcdef", stored.passwordHash)).resolves.toBe(true);
    await expect(resolveSession(currentSession.token)).resolves.toMatchObject({
      id: agent.id,
      mustChangePassword: false,
    });
    await expect(resolveSession(otherSession.token)).resolves.toBeNull();
  });

  it("rejects a change request once the agent is no longer pending", async () => {
    const agent = await createAgent(false);

    await expect(changePendingAgentPassword(
      { id: agent.id, mustChangePassword: false, name: agent.name, role: "AGENT", username: agent.username },
      "abcdef",
      "invalid-token",
    )).rejects.toMatchObject({ code: "PASSWORD_CHANGE_NOT_REQUIRED", status: 409 });
  });
});
