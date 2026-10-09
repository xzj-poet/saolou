import { ApiError } from "@/lib/http/api-error";
import { setRequestActor } from "@/lib/http/request-context";
import { userFromRequest } from "@/modules/auth/current-user";

export async function requireAgentRequest(request: Request) {
  const user = await userFromRequest(request);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
  setRequestActor(request, user.id);
  if (user.role !== "AGENT") throw new ApiError(403, "FORBIDDEN", "无权访问代理页面");
  if (user.mustChangePassword) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "请先设置新的登录密码");
  }
  return user;
}
