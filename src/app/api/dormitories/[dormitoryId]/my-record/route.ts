import { NextResponse } from "next/server";
import { parseJson } from "@/app/api/admin/campus-route-helpers";
import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireRateLimit } from "@/lib/http/rate-limit";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { upsertAgentRecord } from "@/modules/sweep/sweep-record-service";
import { sweepWriteBodySchema } from "@/modules/sweep/sweep-schema";

type Context = { params: Promise<{ dormitoryId: string }> };
export async function PUT(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const agent = await requireAgentRequest(request);
    requireRateLimit(`sweep-write:${agent.id}`, { limit: 120, windowMs: 60_000 });
    const input = await parseJson(request, sweepWriteBodySchema);
    return NextResponse.json(await upsertAgentRecord({ ...input, agentId: agent.id, dormitoryId: (await params).dormitoryId }, agent));
  } catch (error) { return apiErrorResponse(error); }
}
