import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { adminSweepDeleteSchema, adminSweepUpdateSchema } from "@/modules/sweep/admin/admin-sweep-schema";
import { deleteSweepRecordAsAdmin, updateSweepRecordAsAdmin } from "@/modules/sweep/admin/admin-sweep-service";

type Context = { params: Promise<{ recordId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const input = await parseJson(request, adminSweepUpdateSchema);
    return NextResponse.json(await updateSweepRecordAsAdmin((await params).recordId, input, admin.id));
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const input = await parseJson(request, adminSweepDeleteSchema);
    return NextResponse.json(await deleteSweepRecordAsAdmin((await params).recordId, input.expectedVersion, admin.id));
  } catch (error) { return apiErrorResponse(error); }
}
