import { NextResponse } from "next/server";

import { requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { resetAgentPassword } from "@/modules/agents/agent-admin-service";

type Context = { params: Promise<{ agentId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    return NextResponse.json(await resetAgentPassword((await params).agentId));
  } catch (error) { return apiErrorResponse(error); }
}
