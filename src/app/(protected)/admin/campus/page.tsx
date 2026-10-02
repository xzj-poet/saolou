import { CampusManager } from "@/modules/campus/admin/campus-manager";
import { listCampusTreeForAdmin } from "@/modules/campus/campus-read-service";

export default async function CampusPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const [{ school }, schools] = await Promise.all([searchParams, listCampusTreeForAdmin()]);
  return <CampusManager initialSchoolId={school} schools={schools} />;
}
