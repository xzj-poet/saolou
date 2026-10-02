import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireUser } from "@/modules/auth/current-user";

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== "AGENT") {
    redirect("/admin");
  }
  return children;
}
