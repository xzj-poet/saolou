import type { ReactNode } from "react";

import { IdentityMenu } from "@/components/identity-menu";
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
        <div>
          <p className="shell-kicker">校园扫楼</p>
          <strong>下一扇门</strong>
        </div>
        <IdentityMenu user={user} />
      </header>
      {children}
    </div>
  );
}
