import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ensureAdmin } from "@/modules/auth/bootstrap-admin";
import { verifyPassword } from "@/modules/auth/password";

async function deleteBootstrapAdmin() {
  await prisma.user.deleteMany({
    where: { username: "bootstrap-admin" },
  });
}

afterEach(deleteBootstrapAdmin);

describe("administrator bootstrap", () => {
  it("creates exactly one normalized administrator and remains idempotent", async () => {
    const first = await ensureAdmin({
      name: "系统管理员",
      password: "first-secure-password",
      username: "  BOOTSTRAP-ADMIN  ",
    });
    const second = await ensureAdmin({
      name: "不应覆盖的名字",
      password: "replacement-password",
      username: "replacement-admin",
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, id: first.id });

    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      id: first.id,
      name: "系统管理员",
      status: "ACTIVE",
      username: "bootstrap-admin",
    });
    await expect(
      verifyPassword("first-secure-password", admins[0].passwordHash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("replacement-password", admins[0].passwordHash),
    ).resolves.toBe(false);
  });
});
