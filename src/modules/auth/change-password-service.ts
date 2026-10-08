import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";
import { hashPassword } from "@/modules/auth/password";

export async function changePendingAgentPassword(
  user: AuthenticatedUser,
  newPassword: string,
): Promise<void> {
  if (user.role !== "AGENT") {
    throw new ApiError(403, "FORBIDDEN", "无权修改代理密码");
  }
  if (!user.mustChangePassword) {
    throw new ApiError(409, "PASSWORD_CHANGE_NOT_REQUIRED", "当前账号无需修改密码");
  }

  await prisma.user.update({
    data: { mustChangePassword: false, passwordHash: await hashPassword(newPassword) },
    where: { id: user.id },
  });
}
