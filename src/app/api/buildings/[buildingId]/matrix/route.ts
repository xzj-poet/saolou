import { NextResponse } from "next/server";
import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getBuildingMatrixForAgent } from "@/modules/sweep/sweep-read-service";

type Context={params:Promise<{buildingId:string}>};
export async function GET(request:Request,{params}:Context){try{const agent=await requireAgentRequest(request);const floor=new URL(request.url).searchParams.get("floor")??undefined;return NextResponse.json(await getBuildingMatrixForAgent(agent.id,(await params).buildingId,floor));}catch(error){return apiErrorResponse(error);}}
