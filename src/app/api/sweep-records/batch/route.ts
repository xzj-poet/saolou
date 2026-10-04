import { NextResponse } from "next/server";
import { parseJson } from "@/app/api/admin/campus-route-helpers";
import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireRateLimit } from "@/lib/http/rate-limit";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { upsertAgentRecordsBatch } from "@/modules/sweep/sweep-record-service";
import { sweepBatchBodySchema } from "@/modules/sweep/sweep-schema";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const agent = await requireAgentRequest(request);
    requireRateLimit(`sweep-write:${agent.id}`, { limit: 120, windowMs: 60_000 });
    const input = await parseJson(request, sweepBatchBodySchema);
    return NextResponse.json(await upsertAgentRecordsBatch({ ...input, agentId: agent.id }, agent));
  } catch (error) { return apiErrorResponse(error, request); }
}
