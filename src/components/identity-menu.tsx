"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirmNavigation } from "@/components/unsaved-changes-provider";
import type { AuthenticatedUser } from "@/modules/auth/auth-service";

export function IdentityMenu({ user }: { user: AuthenticatedUser }) {
  const router = useRouter();
  const confirmNavigation = useConfirmNavigation();
  const [loading, setLoading] = useState(false);

  async function performLogout() {
    if (loading) {
      return;
    }
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function logout() {
    confirmNavigation(() => void performLogout());
  }

  return (
    <div className="identity-menu" aria-label="当前账号">
      <div className="identity-copy">
        <strong>{user.name}</strong>
        <span>{user.role === "ADMIN" ? "管理员" : "代理"}</span>
      </div>
      <button className="quiet-button" disabled={loading} onClick={logout} type="button">
        {loading ? "正在退出…" : "退出登录"}
      </button>
    </div>
  );
}
