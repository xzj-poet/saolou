import Link from "next/link";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/http/api-error";
import { requireUser } from "@/modules/auth/current-user";
import { getDormitoryLatestRecordsForAgent } from "@/modules/sweep/sweep-read-service";

async function load(userId: string, dormitoryId: string) { try { return await getDormitoryLatestRecordsForAgent(userId, dormitoryId); } catch (error) { if (error instanceof ApiError && error.code === "SCHOOL_ACCESS_DENIED") redirect("/app/schools?access=revoked"); throw error; } }

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ dormitoryId: string }>; searchParams: Promise<{ floor?: string }> }) {
  const [user, { dormitoryId }, query] = await Promise.all([requireUser(), params, searchParams]);
  const history = await load(user.id, dormitoryId);
  const floor = query.floor ?? history.dormitory.floor;
  return <main className="agent-page"><Link className="mobile-back-button" href={`/app/dormitories/${dormitoryId}?floor=${encodeURIComponent(floor)}`}>‹ 返回宿舍</Link><p className="page-kicker">{history.building.name} · {floor}楼</p><h1>{history.dormitory.roomNo} 最新记录</h1><div className="history-list">{history.records.map(record => <article className="history-card" key={record.id}><div><strong>{record.agent.name}</strong><span>{record.status === "COVERED" ? "已覆盖" : "待补扫"}</span></div><p>{record.note ?? "无备注"}</p><time>{record.updatedAt.toLocaleString("zh-CN")}</time></article>)}</div></main>;
}
