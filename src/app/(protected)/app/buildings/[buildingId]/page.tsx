import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { DormitoryDirectory } from "@/modules/campus/agent/dormitory-directory";
import { getDormitoryDirectoryForAgent } from "@/modules/campus/campus-read-service";

async function loadDirectory(userId: string, buildingId: string) {
  try {
    return await getDormitoryDirectoryForAgent(userId, buildingId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked");
    throw error;
  }
}

export default async function BuildingDirectoryPage({ params }: { params: Promise<{ buildingId: string }> }) {
  const [user, { buildingId }] = await Promise.all([requireUser(), params]);
  const directory = await loadDirectory(user.id, buildingId);
  return <DormitoryDirectory directory={directory} />;
}
