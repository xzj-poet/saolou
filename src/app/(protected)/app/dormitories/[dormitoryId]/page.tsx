import Link from "next/link";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { getDormitoryDetailForAgent } from "@/modules/sweep/sweep-read-service";

async function load(userId: string, dormitoryId: string) {
  try { return await getDormitoryDetailForAgent(userId, dormitoryId); }
  catch (error) { if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked"); throw error; }
}

export default async function DormitoryPage({ params, searchParams }: { params: Promise<{ dormitoryId: string }>; searchParams: Promise<{ floor?: string }> }) {
  const [user, { dormitoryId }, query] = await Promise.all([requireUser(), params, searchParams]);
  const detail = await load(user.id, dormitoryId);
  const floor = query.floor ?? detail.dormitory.floor;
  if (!detail.myRecord) redirect(`/app/dormitories/${dormitoryId}/record?floor=${encodeURIComponent(floor)}`);
  return <main className="agent-page">
    <Link className="mobile-back-button" href={`/app/buildings/${detail.building.id}?floor=${encodeURIComponent(floor)}`}>‹ 返回楼层</Link>
    <p className="page-kicker">{detail.building.name} · {floor}楼</p>
    <h1>{detail.dormitory.roomNo}</h1>
    <div className={`record-summary is-${detail.overallStatus.toLowerCase()}`}><b>{detail.overallStatus === "COVERED" ? "已覆盖" : "待补扫"}</b><span>我的状态：{detail.myRecord.status === "COVERED" ? "已覆盖" : "待补扫"}</span><p>{detail.myRecord.note ?? "无备注"}</p><time>{detail.myRecord.updatedAt.toLocaleString("zh-CN")}</time></div>
    <div className="detail-actions"><Link className="primary-link" href={`/app/dormitories/${dormitoryId}/record?floor=${encodeURIComponent(floor)}`}>编辑我的记录</Link><Link className="mobile-back-button" href={`/app/dormitories/${dormitoryId}/history?floor=${encodeURIComponent(floor)}`}>查看最新记录</Link></div>
  </main>;
}
