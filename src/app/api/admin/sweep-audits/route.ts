import { NextResponse } from "next/server";

import { requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { sweepAuditFiltersSchema } from "@/modules/sweep/admin/admin-sweep-schema";
import { listSweepAudits } from "@/modules/sweep/admin/admin-sweep-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const parsed = sweepAuditFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "筛选条件无效");
    return NextResponse.json(await listSweepAudits(parsed.data));
  } catch (error) { return apiErrorResponse(error); }
}
