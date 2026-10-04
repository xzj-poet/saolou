import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { quickNoteCreateSchema } from "@/modules/quick-notes/quick-note-schema";
import { createQuickNote, listQuickNotesForAdmin } from "@/modules/quick-notes/quick-note-service";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return NextResponse.json({ quickNotes: await listQuickNotesForAdmin() });
  } catch (error) { return apiErrorResponse(error, request); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, quickNoteCreateSchema);
    return NextResponse.json({ quickNote: await createQuickNote(input) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, request); }
}
