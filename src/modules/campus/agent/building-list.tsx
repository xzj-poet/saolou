import Link from "next/link";

import type { AgentBuildingPage } from "@/modules/campus/campus-types";

const buildingGenderLabels = { FEMALE: "女生宿舍楼", MALE: "男生宿舍楼" } as const;

export function BuildingList({ page }: { page: AgentBuildingPage }) {
  return (
    <main className="agent-page">
      <Link aria-label="返回学校选择" className="mobile-back-button" href="/app/schools">‹ 返回学校选择</Link>
      <p className="page-kicker">{page.school.name}</p>
      {page.buildings.length ? <div className="building-choice-list">{page.buildings.map((building) => (
        <Link className={`building-choice-card is-${building.gender.toLowerCase()}`} href={`/app/buildings/${building.id}`} key={building.id}>
          <div className="building-choice-heading">
            <strong>{building.name}</strong>
            {building.note ? <small className="building-note-tag">{building.note}</small> : null}
          </div>
          <span>{buildingGenderLabels[building.gender]} · {building.floorCount}层 · {building.dormitoryCount}间宿舍</span>
          <span className="building-sweep-counts"><b>{building.counts.covered} 已覆盖</b><b>{building.counts.pending} 待补扫</b><b>{building.counts.unvisited} 未扫</b></span>
        </Link>
      ))}</div> : <section className="empty-panel compact"><strong>该学校还没有楼栋</strong><span>请联系管理员添加楼栋。</span></section>}
    </main>
  );
}
