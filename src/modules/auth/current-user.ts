import { cookies } from "next/headers";

import type { UserRole } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";
import {
  SESSION_COOKIE_NAME,
} from "@/modules/auth/session-cookie";
import { resolveSession } from "@/modules/auth/session-repository";

function cookieValueFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const pair of cookieHeader.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      return value.join("=");
    }
  }
  return undefined;
}

export async function userFromRequest(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const token = cookieValueFromHeader(request.headers.get("cookie"));
  return token ? resolveSession(token) : null;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await resolveSession(token) : null;

  if (!user) {
    if (token) {
      try {
        cookieStore.delete(SESSION_COOKIE_NAME);
      } catch {
        // Next.js may expose a read-only cookie store during server rendering.
      }
    }
    throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
  }

  return user;
}

export async function requireRole(role: UserRole): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw new ApiError(403, "FORBIDDEN", "无权访问此页面");
  }
  return user;
}
