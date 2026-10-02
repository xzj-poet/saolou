import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { createAgent, listAgentsForAdmin } from "@/modules/agents/agent-admin-service";
import { agentCreateSchema } from "@/modules/agents/agent-schema";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return NextResponse.json({ agents: await listAgentsForAdmin() });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const administrator = await requireAdminRequest(request);
    const input = await parseJson(request, agentCreateSchema);
    return NextResponse.json(await createAgent(administrator.id, input), { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
