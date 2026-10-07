import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { UnsavedChangesProvider } from "@/components/unsaved-changes-provider";
import {
  authenticationRedirect,
  requireUser,
} from "@/modules/auth/current-user";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  try {
    await requireUser();
  } catch (error) {
    redirect(authenticationRedirect(error));
  }
  return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;
}
