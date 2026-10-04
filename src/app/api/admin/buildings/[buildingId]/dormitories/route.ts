import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { addDormitory, addDormitoryBatch, previewDormitoryBatch } from "@/modules/campus/campus-admin-service";
import { dormitoryBatchSchema, dormitoryCreateSchema } from "@/modules/campus/campus-schema";

type Context = { params: Promise<{ buildingId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const { buildingId } = await params;
    const body = await request.clone().json().catch(() => null);
    if (body && typeof body === "object" && "action" in body) {
      const input = await parseJson(request, dormitoryBatchSchema);
      const result =
        input.action === "preview"
          ? await previewDormitoryBatch(buildingId, input.range)
          : await addDormitoryBatch(buildingId, input.range);
      return NextResponse.json(result, { status: input.action === "create" ? 201 : 200 });
    }
    const input = await parseJson(request, dormitoryCreateSchema);
    if (input.buildingId !== buildingId) {
      throw new ApiError(400, "VALIDATION_ERROR", "楼栋参数不一致");
    }
    return NextResponse.json({ dormitory: await addDormitory(input) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
