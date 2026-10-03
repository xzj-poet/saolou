import { SweepDataManager } from "@/modules/sweep/admin/sweep-data-manager";
import { listSweepAudits, listSweepRecords } from "@/modules/sweep/admin/admin-sweep-service";

export default async function SweepDataPage() {
  const [records, audits] = await Promise.all([listSweepRecords(), listSweepAudits()]);
  return <main><p className="page-kicker">记录纠错与追溯</p><h1>扫楼数据</h1><p className="page-copy">筛选当前记录并纠错，所有真实修改和删除都会留下不可变审计。</p><SweepDataManager audits={audits} records={records} /></main>;
}
