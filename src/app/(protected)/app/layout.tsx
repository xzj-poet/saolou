import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  authenticationRedirect,
  requireUser,
} from "@/modules/auth/current-user";

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireUser().catch((error) =>
    redirect(authenticationRedirect(error)),
  );
  if (user.role !== "AGENT") {
    redirect("/admin");
  }
  if (user.mustChangePassword) {
    redirect("/change-password");
  }
  return <AppShell user={user}>{children}</AppShell>;
}
