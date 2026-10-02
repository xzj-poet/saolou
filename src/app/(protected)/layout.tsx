import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  authenticationRedirect,
  requireUser,
} from "@/modules/auth/current-user";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  try {
    await requireUser();
  } catch (error) {
    redirect(authenticationRedirect(error));
  }
  return children;
}
