import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";
import { hashPassword } from "@/modules/auth/password";
import { hashSessionToken } from "@/modules/auth/session-repository";

export async function changePendingAgentPassword(
  user: AuthenticatedUser,
  newPassword: string,
  currentSessionToken: string,
): Promise<void> {
  if (user.role !== "AGENT") {
    throw new ApiError(403, "FORBIDDEN", "无权修改代理密码");
  }
  if (!user.mustChangePassword) {
    throw new ApiError(409, "PASSWORD_CHANGE_NOT_REQUIRED", "当前账号无需修改密码");
  }

  const passwordHash = await hashPassword(newPassword);
  const tokenHash = hashSessionToken(currentSessionToken);

  await prisma.$transaction(async (transaction) => {
    const currentSession = await transaction.session.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        tokenHash,
        userId: user.id,
      },
    });
    if (!currentSession) {
      throw new ApiError(401, "UNAUTHENTICATED", "登录状态已失效，请重新登录");
    }

    await transaction.user.update({
      data: { mustChangePassword: false, passwordHash },
      where: { id: user.id },
    });
    await transaction.session.deleteMany({
      where: { userId: user.id, tokenHash: { not: tokenHash } },
    });
  });
}
