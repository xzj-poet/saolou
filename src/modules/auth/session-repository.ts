import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";

const SESSION_BYTES = 32;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidToken(token: string): boolean {
  if (!TOKEN_PATTERN.test(token)) {
    return false;
  }
  return Buffer.from(token, "base64url").length === SESSION_BYTES;
}

export async function createSession(
  userId: string,
): Promise<{ expiresAt: Date; token: string }> {
  const token = randomBytes(SESSION_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await prisma.session.create({
    data: {
      expiresAt,
      tokenHash: hashToken(token),
      userId,
    },
  });

  return { expiresAt, token };
}

export async function resolveSession(
  token: string,
): Promise<AuthenticatedUser | null> {
  if (!isValidToken(token)) {
    return null;
  }

  const session = await prisma.session.findUnique({
    include: { user: true },
    where: { tokenHash: hashToken(token) },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }

  return {
    id: session.user.id,
    mustChangePassword: session.user.mustChangePassword,
    name: session.user.name,
    role: session.user.role,
    username: session.user.username,
  };
}

export async function revokeSession(token: string): Promise<void> {
  if (!isValidToken(token)) {
    return;
  }

  await prisma.session.deleteMany({
    where: { tokenHash: hashToken(token) },
  });
}
