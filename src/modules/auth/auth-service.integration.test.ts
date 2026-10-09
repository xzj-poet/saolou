import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { AuthenticationError } from "@/modules/auth/auth-errors";
import { authenticateCredentials } from "@/modules/auth/auth-service";
import { hashPassword } from "@/modules/auth/password";

const usernames = ["auth-admin", "auth-agent", "auth-disabled"];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
});

async function createUser(
  username: string,
  role: "ADMIN" | "AGENT",
  status: "ACTIVE" | "DISABLED" = "ACTIVE",
) {
  return prisma.user.create({
    data: {
      name: `${username}-name`,
      passwordHash: await hashPassword("valid-password-123"),
      role,
      status,
      username,
    },
  });
}

async function expectAuthenticationCode(
  promise: Promise<unknown>,
  code: "ACCOUNT_DISABLED" | "INVALID_CREDENTIALS",
) {
  try {
    await promise;
    throw new Error("Expected authentication to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as AuthenticationError).code).toBe(code);
  }
}

describe("credential authentication", () => {
  it.each([
    ["auth-admin", "ADMIN"],
    ["auth-agent", "AGENT"],
  ] as const)("authenticates an active %s database user", async (username, role) => {
    const databaseUser = await createUser(username, role);
    const requestLikeInput = {
      agentId: "forged-agent",
      password: "valid-password-123",
      role: role === "ADMIN" ? "AGENT" : "ADMIN",
      userId: "forged-user",
      username: `  ${username.toUpperCase()}  `,
    };

    await expect(authenticateCredentials(requestLikeInput)).resolves.toEqual({
      id: databaseUser.id,
      mustChangePassword: false,
      name: databaseUser.name,
      role,
      username,
    });
  });

  it("returns the same public failure for an unknown user and wrong password", async () => {
    await createUser("auth-agent", "AGENT");

    await expectAuthenticationCode(
      authenticateCredentials({
        password: "valid-password-123",
        username: "missing-user",
      }),
      "INVALID_CREDENTIALS",
    );
    await expectAuthenticationCode(
      authenticateCredentials({
        password: "wrong-password",
        username: "auth-agent",
      }),
      "INVALID_CREDENTIALS",
    );
  });

  it("rejects a disabled user only after valid credentials", async () => {
    await createUser("auth-disabled", "AGENT", "DISABLED");

    await expectAuthenticationCode(
      authenticateCredentials({
        password: "valid-password-123",
        username: "auth-disabled",
      }),
      "ACCOUNT_DISABLED",
    );
    await expectAuthenticationCode(
      authenticateCredentials({
        password: "wrong-password",
        username: "auth-disabled",
      }),
      "INVALID_CREDENTIALS",
    );
  });
});
