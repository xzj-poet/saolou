import { requireUser } from "@/modules/auth/current-user";
import { SchoolList } from "@/modules/campus/agent/school-list";
import { listSchoolsForAgent } from "@/modules/campus/campus-read-service";

export default async function AgentSchoolsPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const schools = await listSchoolsForAgent(user.id);
  return (
    <main className="agent-page">
      <p className="page-kicker">开始扫楼</p>
      <h1>选择学校</h1>
      <p className="page-copy">请选择今天要进入的校区。未授权学校可见但不能进入。</p>
      {query.access === "revoked" ? <p className="access-warning" role="alert">该学校权限已被取消，请重新选择。</p> : null}
      <SchoolList schools={schools} />
    </main>
  );
}
