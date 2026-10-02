import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireUser } from "@/modules/auth/current-user";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }
  return children;
}
