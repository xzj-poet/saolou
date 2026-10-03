import { NextResponse } from "next/server";

import { parseJson, requireAdminRequest } from "@/app/api/admin/campus-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/lib/http/require-same-origin";
import { quickNoteUpdateSchema } from "@/modules/quick-notes/quick-note-schema";
import { deleteQuickNote, updateQuickNote } from "@/modules/quick-notes/quick-note-service";

type Context = { params: Promise<{ quickNoteId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    const input = await parseJson(request, quickNoteUpdateSchema);
    return NextResponse.json({ quickNote: await updateQuickNote((await params).quickNoteId, input) });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    requireSameOrigin(request);
    await requireAdminRequest(request);
    return NextResponse.json(await deleteQuickNote((await params).quickNoteId));
  } catch (error) { return apiErrorResponse(error); }
}
