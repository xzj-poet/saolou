import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { setDormitoryActive } from "@/modules/campus/campus-admin-service";
import { activeStatusSchema } from "@/modules/campus/campus-schema";

type Context = { params: Promise<{ dormitoryId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, activeStatusSchema);
    return NextResponse.json({
      dormitory: await setDormitoryActive((await params).dormitoryId, input.isActive),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
