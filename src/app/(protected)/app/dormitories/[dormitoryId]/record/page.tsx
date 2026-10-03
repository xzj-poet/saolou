import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { listActiveQuickNotes } from "@/modules/quick-notes/quick-note-service";
import { RecordEditor } from "@/modules/sweep/agent/record-editor";
import { getDormitoryDetailForAgent } from "@/modules/sweep/sweep-read-service";

async function load(userId: string, dormitoryId: string) { try { return await getDormitoryDetailForAgent(userId, dormitoryId); } catch (error) { if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked"); throw error; } }

export default async function RecordPage({ params, searchParams }: { params: Promise<{ dormitoryId: string }>; searchParams: Promise<{ floor?: string }> }) {
  const [user, { dormitoryId }, query, pending, covered] = await Promise.all([requireUser(), params, searchParams, listActiveQuickNotes("PENDING"), listActiveQuickNotes("COVERED")]);
  const detail = await load(user.id, dormitoryId);
  const floor = query.floor ?? detail.dormitory.floor;
  return <RecordEditor backHref={`/app/buildings/${detail.building.id}?floor=${encodeURIComponent(floor)}`} buildingId={detail.building.id} dormitories={[detail.dormitory]} floor={floor} initialNote={detail.myRecord?.note} initialStatus={detail.myRecord?.status} mode={detail.myRecord ? "edit" : "create"} quickNotes={[...pending, ...covered]} title={`${detail.myRecord ? "编辑" : "记录"} ${detail.dormitory.roomNo}`} />;
}
