import { NextResponse } from "next/server";

import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { userFromRequest } from "@/modules/auth/current-user";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await userFromRequest(request);
    if (!user) {
      throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
    }
    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
