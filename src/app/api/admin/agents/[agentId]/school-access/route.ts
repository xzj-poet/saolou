import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { replaceAgentSchoolAccess } from "@/modules/agents/agent-admin-service";
import { agentSchoolAccessSchema } from "@/modules/agents/agent-schema";

type Context = { params: Promise<{ agentId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const administrator = await requireAdminRequest(request);
    const input = await parseJson(request, agentSchoolAccessSchema);
    await replaceAgentSchoolAccess((await params).agentId, input.schoolIds, administrator.id);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiErrorResponse(error, request); }
}
