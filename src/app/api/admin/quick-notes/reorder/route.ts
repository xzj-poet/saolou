import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { quickNoteReorderSchema } from "@/modules/quick-notes/quick-note-schema";
import { reorderQuickNotes } from "@/modules/quick-notes/quick-note-service";

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, quickNoteReorderSchema);
    return NextResponse.json({ quickNotes: await reorderQuickNotes(input.status, input.orderedIds) });
  } catch (error) { return apiErrorResponse(error); }
}
