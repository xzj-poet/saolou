import { prisma } from "@/lib/db";
import { hashPassword } from "@/modules/auth/password";

export interface EnsureAdminInput {
  name: string;
  password: string;
  username: string;
}

export interface EnsureAdminResult {
  created: boolean;
  id: string;
}

export async function ensureAdmin(
  input: EnsureAdminInput,
): Promise<EnsureAdminResult> {
  const existingAdmin = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    where: { role: "ADMIN" },
  });
  if (existingAdmin) {
    return { created: false, id: existingAdmin.id };
  }

  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  if (!username || !name) {
    throw new Error("Administrator name and username are required.");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (transaction) => {
    const adminCreatedByAnotherRequest = await transaction.user.findFirst({
      orderBy: { createdAt: "asc" },
      where: { role: "ADMIN" },
    });
    if (adminCreatedByAnotherRequest) {
      return { created: false, id: adminCreatedByAnotherRequest.id };
    }

    const admin = await transaction.user.create({
      data: {
        name,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        username,
      },
    });

    return { created: true, id: admin.id };
  });
}
