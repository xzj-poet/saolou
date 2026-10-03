import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getDormitoryDetailForAgent } from "@/modules/sweep/sweep-read-service";

type Context = { params: Promise<{ dormitoryId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const agent = await requireAgentRequest(request);
    return NextResponse.json(
      await getDormitoryDetailForAgent(agent.id, (await params).dormitoryId),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
