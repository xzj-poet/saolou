import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import {
  buildClearedSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/modules/auth/session-cookie";
import { revokeSession } from "@/modules/auth/session-repository";

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
    const token = tokenFromRequest(request);
    if (token) {
      await revokeSession(token);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      buildClearedSessionCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
