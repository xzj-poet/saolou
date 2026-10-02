import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { listBuildingsForAgent } from "@/modules/campus/campus-read-service";

type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const agent = await requireAgentRequest(request);
    return NextResponse.json(await listBuildingsForAgent(agent.id, (await params).schoolId));
  } catch (error) { return apiErrorResponse(error); }
}
