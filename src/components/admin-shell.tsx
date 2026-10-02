import type { ReactNode } from "react";

import { IdentityMenu } from "@/components/identity-menu";
import { AdminNavigation } from "@/components/admin-navigation";
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
        <div>
          <p className="shell-kicker">校园扫楼记录系统</p>
          <strong>管理员后台</strong>
        </div>
        <IdentityMenu user={user} />
      </header>
      <div className="admin-body">
        <AdminNavigation />
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
