"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

interface LoginResponse {
  error?: { message?: string };
  user?: { role: "ADMIN" | "AGENT" };
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ password, username }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as LoginResponse;
      if (!response.ok || !body.user) {
        setError(body.error?.message ?? "登录失败，请稍后重试");
        return;
      }

      router.replace(body.user.role === "ADMIN" ? "/admin" : "/app/schools");
    } catch {
      setError("网络连接失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="username">
        账号
      </label>
      <input
        autoComplete="username"
        className="text-input"
        disabled={loading}
        id="username"
        name="username"
        onChange={(event) => setUsername(event.target.value)}
        required
        value={username}
      />

      <label className="field-label" htmlFor="password">
        密码
      </label>
      <div className="password-field">
        <input
          autoComplete="current-password"
          className="text-input"
          disabled={loading}
          id="password"
          maxLength={128}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type={showPassword ? "text" : "password"}
          value={password}
        />
        <button
          aria-label={showPassword ? "隐藏密码" : "显示密码"}
          className="password-toggle"
          disabled={loading}
          onClick={() => setShowPassword((visible) => !visible)}
          type="button"
        >
          {showPassword ? "隐藏" : "显示"}
        </button>
      </div>

      <p aria-live="polite" className="form-error" role={error ? "alert" : undefined}>
        {error}
      </p>

      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
