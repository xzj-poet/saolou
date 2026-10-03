import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { BuildingMatrix } from "@/modules/sweep/agent/building-matrix";
import { getBuildingMatrixForAgent } from "@/modules/sweep/sweep-read-service";

async function loadDirectory(userId: string, buildingId: string) {
  try {
    return await getBuildingMatrixForAgent(userId, buildingId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked");
    throw error;
  }
}

export default async function BuildingDirectoryPage({ params, searchParams }: { params: Promise<{ buildingId: string }>; searchParams: Promise<{floor?:string}> }) {
  const [user, { buildingId },query] = await Promise.all([requireUser(), params,searchParams]);
  const matrix = await loadDirectory(user.id, buildingId);
  const floor=query.floor??matrix.floors[0]?.floor??"";
  return <BuildingMatrix floor={floor} matrix={matrix} />;
}
