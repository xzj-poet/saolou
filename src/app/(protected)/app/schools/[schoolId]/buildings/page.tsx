import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { BuildingList } from "@/modules/campus/agent/building-list";
import { listBuildingsForAgent } from "@/modules/campus/campus-read-service";

async function loadBuildings(userId: string, schoolId: string) {
  try {
    return await listBuildingsForAgent(userId, schoolId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked");
    throw error;
  }
}

export default async function BuildingsPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const [user, { schoolId }] = await Promise.all([requireUser(), params]);
  const page = await loadBuildings(user.id, schoolId);
  return <BuildingList page={page} />;
}
