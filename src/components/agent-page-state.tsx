"use client";

export function AgentPageLoading() {
  return (
    <main className="agent-page">
      <section aria-live="polite" className="empty-panel" role="status">
        <strong>正在加载最新数据…</strong>
        <span>请稍候，页面会在数据准备好后自动更新。</span>
      </section>
    </main>
  );
}

export function AgentPageError({ retry }: { retry: () => void }) {
  return (
    <main className="agent-page">
      <section className="empty-panel" role="alert">
        <h1>暂时无法加载此页面</h1>
        <p>当前页面位置已经保留，请重新加载最新数据。</p>
        <button className="primary-button full-button" onClick={retry} type="button">重新加载</button>
      </section>
    </main>
  );
}
