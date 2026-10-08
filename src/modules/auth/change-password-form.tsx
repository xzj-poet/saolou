"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type ChangePasswordFormProps = { username?: string };

export function ChangePasswordForm({ username }: ChangePasswordFormProps) {
  const router = useRouter();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        body: JSON.stringify({ confirmPassword, newPassword }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "保存失败，请稍后重试");
        return;
      }
      router.replace("/app/schools");
      router.refresh();
    } catch {
      setError("网络连接失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (loading) return;

    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {username ? <p className="change-password-account">当前账号：{username}</p> : null}
      <p className="password-help">请设置一个自己容易记住的新密码，至少 6 位。</p>

      <label className="field-label" htmlFor="new-password">新密码</label>
      <input
        autoComplete="new-password"
        className="text-input"
        disabled={loading}
        id="new-password"
        maxLength={128}
        minLength={6}
        name="newPassword"
        onChange={(event) => setNewPassword(event.target.value)}
        required
        type="password"
        value={newPassword}
      />

      <label className="field-label" htmlFor="confirm-password">确认新密码</label>
      <input
        autoComplete="new-password"
        className="text-input"
        disabled={loading}
        id="confirm-password"
        maxLength={128}
        minLength={6}
        name="confirmPassword"
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
        type="password"
        value={confirmPassword}
      />

      <p aria-live="polite" className="form-error" role={error ? "alert" : undefined}>{error}</p>

      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "正在保存…" : "保存新密码"}
      </button>
      <button className="quiet-button" disabled={loading} onClick={() => void logout()} type="button">
        退出登录
      </button>
    </form>
  );
}
