import { NextResponse } from "next/server";

import { requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireRateLimit } from "@/lib/http/rate-limit";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { resetAgentPassword } from "@/modules/agents/agent-admin-service";

type Context = { params: Promise<{ agentId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    requireRateLimit(`password-reset:${admin.id}`, { limit: 10, windowMs: 60 * 60_000 });
    return NextResponse.json(await resetAgentPassword((await params).agentId));
  } catch (error) { return apiErrorResponse(error, request); }
}
