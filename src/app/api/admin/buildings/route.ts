import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { createBuilding } from "@/modules/campus/campus-admin-service";
import { buildingCreateSchema } from "@/modules/campus/campus-schema";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, buildingCreateSchema);
    return NextResponse.json({ building: await createBuilding(input) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
