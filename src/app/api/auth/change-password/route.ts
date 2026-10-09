import { NextResponse } from "next/server";

import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { changePasswordSchema } from "@/modules/auth/change-password-schema";
import { changePendingAgentPassword } from "@/modules/auth/change-password-service";
import { userFromRequest } from "@/modules/auth/current-user";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session-cookie";

function tokenFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  return cookieHeader
    ?.split(";")
    .map((pair) => pair.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE_NAME)
    ?.slice(1)
    .join("=");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user) {
      throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
    }
    const sessionToken = tokenFromRequest(request);
    if (!sessionToken) {
      throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "请求内容格式不正确");
    }
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "请检查填写内容", {
        form: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await changePendingAgentPassword(user, parsed.data.newPassword, sessionToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
