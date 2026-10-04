import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { createSchool } from "@/modules/campus/campus-admin-service";
import { listCampusTreeForAdmin } from "@/modules/campus/campus-read-service";
import { schoolCreateSchema } from "@/modules/campus/campus-schema";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return NextResponse.json({ schools: await listCampusTreeForAdmin() });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, schoolCreateSchema);
    return NextResponse.json({ school: await createSchool(input) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
