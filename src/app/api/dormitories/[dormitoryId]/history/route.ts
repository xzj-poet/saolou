import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getDormitoryLatestRecordsForAgent } from "@/modules/sweep/sweep-read-service";

type Context = { params: Promise<{ dormitoryId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const agent = await requireAgentRequest(request);
    return NextResponse.json(
      await getDormitoryLatestRecordsForAgent(agent.id, (await params).dormitoryId),
    );
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
