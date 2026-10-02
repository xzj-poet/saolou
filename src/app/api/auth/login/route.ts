import { NextResponse } from "next/server";

import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { AuthenticationError } from "@/modules/auth/auth-errors";
import { loginSchema } from "@/modules/auth/auth-schema";
import { authenticateCredentials } from "@/modules/auth/auth-service";
import { buildSessionCookie } from "@/modules/auth/session-cookie";
import { createSession } from "@/modules/auth/session-repository";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireSameOrigin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "请求内容格式不正确");
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "请检查账号和密码", {
        form: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const user = await authenticateCredentials(parsed.data);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(
      buildSessionCookie(
        session.token,
        session.expiresAt,
        process.env.NODE_ENV === "production",
      ),
    );
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return apiErrorResponse(
        error.code === "ACCOUNT_DISABLED"
          ? new ApiError(403, error.code, "账号已停用，请联系管理员")
          : new ApiError(401, error.code, "账号或密码错误"),
      );
    }
    return apiErrorResponse(error);
  }
}
