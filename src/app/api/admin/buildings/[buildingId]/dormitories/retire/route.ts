import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { retireDormitories } from "@/modules/campus/campus-admin-service";
import { dormitoryRetireSchema } from "@/modules/campus/campus-schema";

type Context = { params: Promise<{ buildingId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, dormitoryRetireSchema);
    return NextResponse.json(
      await retireDormitories((await params).buildingId, input.dormitoryIds),
    );
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
