import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { retireSchool, setSchoolActive, updateSchool } from "@/modules/campus/campus-admin-service";
import { activeStatusSchema, schoolUpdateSchema } from "@/modules/campus/campus-schema";

type Context = { params: Promise<{ schoolId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const { schoolId } = await params;
    const body = await request.clone().json().catch(() => null);
    if (body && typeof body === "object" && "isActive" in body) {
      const input = await parseJson(request, activeStatusSchema);
      return NextResponse.json({ school: await setSchoolActive(schoolId, input.isActive) });
    }
    const input = await parseJson(request, schoolUpdateSchema);
    return NextResponse.json({ school: await updateSchool(schoolId, input) });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    return NextResponse.json(await retireSchool((await params).schoolId));
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
