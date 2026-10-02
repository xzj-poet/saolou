import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireUser } from "@/modules/auth/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/app/schools");
  }
  return children;
}
