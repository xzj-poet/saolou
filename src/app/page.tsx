import Link from "next/link";

export default function Page() {
  return (
    <main className="landing-shell">
      <section className="landing-card" aria-labelledby="landing-title">
        <p className="eyebrow">自研扫楼系统 内部使用</p>
        <h1 id="landing-title">校园扫楼记录系统</h1>
        <p className="landing-copy">记录扫楼数据，提高扫楼效率！</p>
        <Link className="primary-link" href="/login">
          进入系统
        </Link>
      </section>
    </main>
  );
}
