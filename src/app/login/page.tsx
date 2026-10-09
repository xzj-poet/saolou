import { LoginForm } from "@/modules/auth/login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section aria-labelledby="login-title" className="login-card">
        <p className="eyebrow">自研扫楼系统 内部使用</p>
        <h1 id="login-title">登录扫楼系统</h1>
        <p className="login-copy">记录扫楼数据，提高扫楼效率！</p>
        <LoginForm />
      </section>
    </main>
  );
}
