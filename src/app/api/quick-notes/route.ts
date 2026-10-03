import { NextResponse } from "next/server";

import { requireAgentRequest } from "@/app/api/agent-route-helpers";
import { apiErrorResponse } from "@/lib/http/api-response";
import { quickNoteStatusSchema } from "@/modules/quick-notes/quick-note-schema";
import { listActiveQuickNotes } from "@/modules/quick-notes/quick-note-service";

export async function GET(request: Request) {
  try {
    await requireAgentRequest(request);
    const parsed = quickNoteStatusSchema.safeParse(new URL(request.url).searchParams.get("status"));
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "请选择有效状态" } }, { status: 400 });
    return NextResponse.json({ quickNotes: await listActiveQuickNotes(parsed.data) });
  } catch (error) { return apiErrorResponse(error); }
}
