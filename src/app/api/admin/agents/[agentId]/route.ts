import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { renameAgent, setAgentStatus } from "@/modules/agents/agent-admin-service";
import { agentRenameSchema, agentStatusSchema } from "@/modules/agents/agent-schema";

type Context = { params: Promise<{ agentId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const { agentId } = await params;
    const body = await request.clone().json().catch(() => null);
    if (body && typeof body === "object" && "status" in body) {
      const input = await parseJson(request, agentStatusSchema);
      return NextResponse.json({ agent: await setAgentStatus(agentId, input.status) });
    }
    const input = await parseJson(request, agentRenameSchema);
    return NextResponse.json({ agent: await renameAgent(agentId, input) });
  } catch (error) { return apiErrorResponse(error, request); }
}
