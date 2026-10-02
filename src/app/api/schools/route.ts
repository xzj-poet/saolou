import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { listSchoolsForAgent } from "@/modules/campus/campus-read-service";

export async function GET(request: Request) {
  try {
    const agent = await requireAgentRequest(request);
    return NextResponse.json({ schools: await listSchoolsForAgent(agent.id) });
  } catch (error) { return apiErrorResponse(error); }
}
