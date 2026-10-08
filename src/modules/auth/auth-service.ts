import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AuthenticationError } from "@/modules/auth/auth-errors";
import { hashPassword, verifyPassword } from "@/modules/auth/password";

export interface AuthenticatedUser {
  id: string;
  mustChangePassword: boolean;
  name: string;
  role: UserRole;
  username: string;
}

export interface AuthenticateCredentialsInput {
  password: string;
  username: string;
}

const dummyHash = hashPassword("dummy-password-never-accepted");

export async function authenticateCredentials(
  input: AuthenticateCredentialsInput,
): Promise<AuthenticatedUser> {
  const username = input.username.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username } });
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await dummyHash),
  );

  if (!user || !passwordMatches) {
    throw new AuthenticationError("INVALID_CREDENTIALS");
  }
  if (user.status === "DISABLED") {
    throw new AuthenticationError("ACCOUNT_DISABLED");
  }

  return {
    id: user.id,
    mustChangePassword: user.mustChangePassword,
    name: user.name,
    role: user.role,
    username: user.username,
  };
}
