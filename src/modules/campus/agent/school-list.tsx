import Link from "next/link";

import type { AgentSchoolRow } from "@/modules/campus/campus-types";

export function SchoolList({ schools }: { schools: AgentSchoolRow[] }) {
  if (schools.length === 0) {
    return <section className="empty-panel compact"><strong>暂无学校</strong><span>请联系管理员建立学校数据。</span></section>;
  }
  return (
    <div className="agent-choice-list">
      {schools.map((school) => school.isAuthorized ? (
        <Link className="agent-choice-row" href={`/app/schools/${school.id}/buildings`} key={school.id}>
          <strong>{school.name}</strong><span className="authorization-pill">已授权</span>
        </Link>
      ) : (
        <div aria-disabled="true" className="agent-choice-row is-disabled" key={school.id}>
          <strong>{school.name}</strong><span className="authorization-pill">未授权</span>
        </div>
      ))}
    </div>
  );
}
