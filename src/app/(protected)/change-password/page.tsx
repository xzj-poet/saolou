import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/modules/auth/change-password-form";
import { authenticationRedirect, requireUser } from "@/modules/auth/current-user";

export default async function ChangePasswordPage() {
  const user = await requireUser().catch((error) => redirect(authenticationRedirect(error)));
  if (user.role !== "AGENT") redirect("/admin");
  if (!user.mustChangePassword) redirect("/app/schools");

  return (
    <main className="login-shell">
      <section aria-labelledby="change-password-title" className="login-card">
        <p className="eyebrow">首次登录设置</p>
        <h1 id="change-password-title">设置新的登录密码</h1>
        <p className="login-copy">临时密码仅供本次登录使用，保存后请用新密码登录。</p>
        <ChangePasswordForm username={user.username} />
      </section>
    </main>
  );
}
