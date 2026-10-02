import Link from "next/link";

import type { AgentDormitoryDirectory } from "@/modules/campus/campus-types";

export function DormitoryDirectory({ directory }: { directory: AgentDormitoryDirectory }) {
  return (
    <main className="agent-page">
      <Link aria-label="返回楼栋选择" className="mobile-back-button" href={`/app/schools/${directory.school.id}/buildings`}>‹ 返回楼栋选择</Link>
      <p className="page-kicker">{directory.school.name}</p>
      <h1>{directory.building.name}</h1>
      <p className="page-copy">当前为宿舍基础目录；扫楼状态将在下一阶段接入。</p>
      {directory.floors.length ? <div className="dormitory-directory">{directory.floors.map((floor) => (
        <section aria-label={`${floor.floor}楼宿舍`} className="directory-floor" key={floor.floor}>
          <h2>{floor.floor}楼</h2>
          <div className="directory-rooms">{floor.dormitories.map((room) => <div className="directory-room" key={room.id}>{room.roomNo}</div>)}</div>
        </section>
      ))}</div> : <section className="empty-panel compact"><strong>该楼栋还没有宿舍</strong><span>请联系管理员添加宿舍。</span></section>}
    </main>
  );
}
