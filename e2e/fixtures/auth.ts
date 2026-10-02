import { randomUUID } from "node:crypto";

import { test as base, expect } from "@playwright/test";

import { prisma } from "../../src/lib/db";
import { hashPassword } from "../../src/modules/auth/password";

export interface AuthUsers {
  admin: { password: string; username: string };
  agent: { password: string; username: string };
}

export const test = base.extend<Record<string, never>, { authUsers: AuthUsers }>({
  authUsers: [async ({}, use, workerInfo) => {
    const suffix = `${workerInfo.project.name}-${randomUUID()}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const password = "E2e-password-123";
    const passwordHash = await hashPassword(password);
    const admin = await prisma.user.create({
      data: {
        name: "测试管理员",
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        username: `e2e-admin-${suffix}`,
      },
    });
    const agent = await prisma.user.create({
      data: {
        name: "测试代理",
        passwordHash,
        role: "AGENT",
        status: "ACTIVE",
        username: `e2e-agent-${suffix}`,
      },
    });

    await use({
      admin: { password, username: admin.username },
      agent: { password, username: agent.username },
    });

    await prisma.session.deleteMany({
      where: { userId: { in: [admin.id, agent.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, agent.id] } } });
  }, { scope: "worker" }],
});

export { expect };
