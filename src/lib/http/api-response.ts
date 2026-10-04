import { NextResponse } from "next/server";

import { ApiError } from "@/lib/http/api-error";
import { requestId, writeApiErrorLog } from "@/lib/http/request-context";

export function apiErrorResponse(error: unknown, request: Request): NextResponse {
  if (error instanceof ApiError) {
    writeApiErrorLog({ code: error.code, request, status: error.status });
    const headers = new Headers(error.responseHeaders);
    headers.set("x-request-id", requestId(request));
    return NextResponse.json(
      {
        error: {
          code: error.code,
          ...(error.fields ? { fields: error.fields } : {}),
          message: error.message,
        },
      },
      { headers, status: error.status },
    );
  }

  writeApiErrorLog({ code: "INTERNAL_ERROR", request, status: 500 });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } },
    { headers: { "x-request-id": requestId(request) }, status: 500 },
  );
}
