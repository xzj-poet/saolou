import type { ReactNode } from "react";

import { IdentityMenu } from "@/components/identity-menu";
import { AdminNavigation } from "@/components/admin-navigation";
import { ProductUsage } from "@/components/product-usage";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
}) {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <ProductUsage />
        <IdentityMenu user={user} />
      </header>
      <div className="admin-body">
        <AdminNavigation />
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
