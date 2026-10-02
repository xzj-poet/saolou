import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getDormitoryDirectoryForAgent } from "@/modules/campus/campus-read-service";

type Context = { params: Promise<{ buildingId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const agent = await requireAgentRequest(request);
    return NextResponse.json(await getDormitoryDirectoryForAgent(agent.id, (await params).buildingId));
  } catch (error) { return apiErrorResponse(error); }
}
