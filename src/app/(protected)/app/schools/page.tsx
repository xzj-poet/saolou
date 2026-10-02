export default function AgentSchoolsPage() {
  return (
    <main className="agent-page">
      <p className="page-kicker">开始扫楼</p>
      <h1>选择学校</h1>
      <p className="page-copy">这里只会展示管理员授权给你的学校。</p>
      <section className="empty-panel compact">
        <strong>暂无已授权学校</strong>
        <span>请联系管理员配置学校访问权限。</span>
      </section>
    </main>
  );
}
