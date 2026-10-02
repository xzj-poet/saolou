import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  createSession,
  resolveSession,
  revokeSession,
} from "@/modules/auth/session-repository";

const username = "session-agent";

afterEach(async () => {
  const user = await prisma.user.findUnique({ where: { username } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

async function createAgent() {
  return prisma.user.create({
    data: {
      name: "会话代理",
      passwordHash: "unused-hash",
      role: "AGENT",
      status: "ACTIVE",
      username,
    },
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("database-backed sessions", () => {
  it("returns a random raw token while storing only its SHA-256 hash", async () => {
    const user = await createAgent();
    const first = await createSession(user.id);
    const second = await createSession(user.id);
    const stored = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: sha256(first.token) },
    });

    expect(Buffer.from(first.token, "base64url")).toHaveLength(32);
    expect(first.token).not.toBe(second.token);
    expect(stored.tokenHash).toBe(sha256(first.token));
    expect(JSON.stringify(stored)).not.toContain(first.token);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves only an active user with a valid unexpired token", async () => {
    const user = await createAgent();
    const session = await createSession(user.id);

    await expect(resolveSession(session.token)).resolves.toEqual({
      id: user.id,
      name: user.name,
      role: "AGENT",
      username,
    });

    await prisma.user.update({
      data: { status: "DISABLED" },
      where: { id: user.id },
    });
    await expect(resolveSession(session.token)).resolves.toBeNull();
  });

  it("returns null for revoked, expired, malformed, and unknown tokens", async () => {
    const user = await createAgent();
    const revoked = await createSession(user.id);
    await revokeSession(revoked.token);

    const expiredToken = Buffer.alloc(32, 7).toString("base64url");
    await prisma.session.create({
      data: {
        expiresAt: new Date(Date.now() - 1_000),
        tokenHash: sha256(expiredToken),
        userId: user.id,
      },
    });

    await expect(resolveSession(revoked.token)).resolves.toBeNull();
    await expect(resolveSession(expiredToken)).resolves.toBeNull();
    await expect(resolveSession("not valid !!!")).resolves.toBeNull();
    await expect(
      resolveSession(Buffer.alloc(32, 9).toString("base64url")),
    ).resolves.toBeNull();
  });
});
