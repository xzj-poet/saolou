import { NextResponse } from "next/server";

import { buildClearedSessionCookie } from "@/modules/auth/session-cookie";

export function GET(request: Request): NextResponse {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(
    buildClearedSessionCookie(process.env.NODE_ENV === "production"),
  );
  return response;
}
