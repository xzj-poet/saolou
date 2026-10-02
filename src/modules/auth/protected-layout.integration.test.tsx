import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import AdminLayout from "@/app/(protected)/admin/layout";
import AgentLayout from "@/app/(protected)/app/layout";
import ProtectedLayout from "@/app/(protected)/layout";
import { createSession } from "@/modules/auth/session-repository";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
const cookieState = vi.hoisted(() => ({
  delete: vi.fn(),
  token: undefined as string | undefined,
}));

vi.mock("next/navigation", () => ({ redirect: navigation.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: cookieState.delete,
    get: () =>
      cookieState.token ? { name: "campus_sweep_session", value: cookieState.token } : undefined,
  }),
}));

const usernames = ["layout-agent", "layout-admin", "layout-disabled"];

afterEach(async () => {
  cookieState.token = undefined;
  cookieState.delete.mockReset();
  navigation.redirect.mockClear();
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { in: usernames } },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: users.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
});

async function sessionFor(
  username: string,
  role: "ADMIN" | "AGENT",
  disabled = false,
) {
  const user = await prisma.user.create({
    data: {
      name: username,
      passwordHash: "unused",
      role,
      status: "ACTIVE",
      username,
    },
  });
  const session = await createSession(user.id);
  if (disabled) {
    await prisma.user.update({
      data: { status: "DISABLED" },
      where: { id: user.id },
    });
  }
  cookieState.token = session.token;
}

describe("protected route layouts", () => {
  it("redirects unauthenticated access to login", async () => {
    await expect(ProtectedLayout({ children: "content" })).rejects.toThrow(
      "REDIRECT:/login",
    );
  });

  it("redirects an agent away from administrator routes", async () => {
    await sessionFor("layout-agent", "AGENT");
    await expect(AdminLayout({ children: "content" })).rejects.toThrow(
      "REDIRECT:/app/schools",
    );
  });

  it("redirects an administrator away from the agent school flow", async () => {
    await sessionFor("layout-admin", "ADMIN");
    await expect(AgentLayout({ children: "content" })).rejects.toThrow(
      "REDIRECT:/admin",
    );
  });

  it("clears a disabled user's existing cookie and redirects", async () => {
    await sessionFor("layout-disabled", "AGENT", true);
    await expect(ProtectedLayout({ children: "content" })).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(cookieState.delete).toHaveBeenCalledWith("campus_sweep_session");
  });
});
