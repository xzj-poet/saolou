import type { ReactNode } from "react";

import { IdentityMenu } from "@/components/identity-menu";
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
        <nav aria-label="后台导航" className="admin-nav">
          <a aria-current="page" href="/admin">基础数据</a>
          <span aria-disabled="true">代理账号</span>
          <span aria-disabled="true">快捷备注</span>
          <span aria-disabled="true">扫楼数据</span>
        </nav>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
