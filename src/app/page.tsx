import Link from "next/link";

export default function Page() {
  return (
    <main className="landing-shell">
      <section className="landing-card" aria-labelledby="landing-title">
        <div className="landing-mark" aria-hidden="true">
          门
        </div>
        <p className="eyebrow">单团队 · 在线使用</p>
        <h1 id="landing-title">校园扫楼记录系统</h1>
        <p className="landing-copy">只回答：下一扇门应该敲哪里？</p>
        <Link className="primary-link" href="/login">
          进入系统
        </Link>
      </section>
    </main>
  );
}
