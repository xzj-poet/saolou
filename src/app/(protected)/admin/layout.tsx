import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import {
  authenticationRedirect,
  requireUser,
} from "@/modules/auth/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser().catch((error) =>
    redirect(authenticationRedirect(error)),
  );
  if (user.role !== "ADMIN") {
    redirect("/app/schools");
  }
  return <AdminShell user={user}>{children}</AdminShell>;
}
