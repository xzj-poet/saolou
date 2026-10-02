import { LoginForm } from "@/modules/auth/login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section aria-labelledby="login-title" className="login-card">
        <div aria-hidden="true" className="landing-mark">门</div>
        <p className="eyebrow">单团队 · 在线使用</p>
        <h1 id="login-title">登录扫楼系统</h1>
        <p className="login-copy">查看哪些宿舍仍值得继续敲门。</p>
        <LoginForm />
      </section>
    </main>
  );
}
