import { NextResponse } from "next/server";

import { ApiError } from "@/lib/http/api-error";

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          ...(error.fields ? { fields: error.fields } : {}),
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } },
    { status: 500 },
  );
}
