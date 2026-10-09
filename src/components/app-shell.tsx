import type { ReactNode } from "react";

import { IdentityMenu } from "@/components/identity-menu";
import { ProductUsage } from "@/components/product-usage";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
}) {
  return (
    <div className="agent-shell">
      <header className="agent-header">
        <ProductUsage />
        <IdentityMenu user={user} />
      </header>
      {children}
    </div>
  );
}
