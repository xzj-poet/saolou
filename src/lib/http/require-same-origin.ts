import { ApiError } from "@/lib/http/api-error";

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ApiError(403, "ORIGIN_MISMATCH", "请求来源无效");
  }

  try {
    const parsedOrigin = new URL(origin);
    const requestOrigin = new URL(request.url).origin;
    if (parsedOrigin.origin !== requestOrigin || parsedOrigin.origin !== origin) {
      throw new ApiError(403, "ORIGIN_MISMATCH", "请求来源无效");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(403, "ORIGIN_MISMATCH", "请求来源无效");
  }
}
