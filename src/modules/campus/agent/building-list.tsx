import Link from "next/link";

import type { AgentBuildingPage } from "@/modules/campus/campus-types";

export function BuildingList({ page }: { page: AgentBuildingPage }) {
  return (
    <main className="agent-page">
      <Link aria-label="返回学校选择" className="mobile-back-button" href="/app/schools">‹ 返回学校选择</Link>
      <p className="page-kicker">{page.school.name}</p>
      <h1>选择楼栋</h1>
      <p className="page-copy">点击楼栋后查看已录入的楼层与宿舍。</p>
      {page.buildings.length ? <div className="building-choice-list">{page.buildings.map((building) => (
        <Link className="building-choice-card" href={`/app/buildings/${building.id}`} key={building.id}>
          <strong>{building.name}</strong>
          <span>{building.floorCount}层 · {building.dormitoryCount}间宿舍</span>
          {building.note ? <small>{building.note}</small> : null}
        </Link>
      ))}</div> : <section className="empty-panel compact"><strong>该学校还没有楼栋</strong><span>请联系管理员添加楼栋。</span></section>}
    </main>
  );
}
