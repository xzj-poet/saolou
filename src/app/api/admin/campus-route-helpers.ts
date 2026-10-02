import type { z } from "zod";

import { ApiError } from "@/lib/http/api-error";
import { userFromRequest } from "@/modules/auth/current-user";

export async function requireAdminRequest(request: Request) {
  const user = await userFromRequest(request);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
  if (user.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "无权执行此操作");
  return user;
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "请求内容格式不正确");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] ? String(issue.path[0]) : "form";
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    throw new ApiError(400, "VALIDATION_ERROR", "请检查填写内容", fields);
  }
  return parsed.data;
}
