import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { retireBuilding, setBuildingActive, updateBuilding } from "@/modules/campus/campus-admin-service";
import { activeStatusSchema, buildingUpdateSchema } from "@/modules/campus/campus-schema";

type Context = { params: Promise<{ buildingId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const { buildingId } = await params;
    const body = await request.clone().json().catch(() => null);
    if (body && typeof body === "object" && "isActive" in body) {
      const input = await parseJson(request, activeStatusSchema);
      return NextResponse.json({ building: await setBuildingActive(buildingId, input.isActive) });
    }
    const input = await parseJson(request, buildingUpdateSchema);
    return NextResponse.json({ building: await updateBuilding(buildingId, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    return NextResponse.json(await retireBuilding((await params).buildingId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
