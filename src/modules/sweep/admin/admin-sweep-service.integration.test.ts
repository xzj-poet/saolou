import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { deleteSweepRecordAsAdmin, listSweepAudits, listSweepRecords, updateSweepRecordAsAdmin } from "@/modules/sweep/admin/admin-sweep-service";
import { getDormitoryOverallStatus, upsertAgentRecord } from "@/modules/sweep/sweep-record-service";

const prefix = "admin-sweep-";

afterEach(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } });
  const userIds = users.map(({ id }) => id); const schoolIds = schools.map(({ id }) => id);
  const dormitories = await prisma.dormitory.findMany({ select: { id: true }, where: { building: { schoolId: { in: schoolIds } } } });
  const dormitoryIds = dormitories.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.dormitory.deleteMany({ where: { id: { in: dormitoryIds } } });
  await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function fixture() {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "x", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
  const first = await prisma.user.create({ data: { name: "甲代理", passwordHash: "x", role: "AGENT", username: `${prefix}first-${suffix}` } });
  const second = await prisma.user.create({ data: { name: "乙代理", passwordHash: "x", role: "AGENT", username: `${prefix}second-${suffix}` } });
  const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } });
  const building = await prisma.building.create({ data: { name: "8号楼", schoolId: school.id } });
  const dormitory = await prisma.dormitory.create({ data: { buildingId: building.id, floor: "3", roomNo: "301" } });
  const covered = await prisma.sweepRecord.create({ data: { agentId: first.id, dormitoryId: dormitory.id, note: "完成", status: "COVERED" } });
  const pending = await prisma.sweepRecord.create({ data: { agentId: second.id, dormitoryId: dormitory.id, note: "无人", status: "PENDING" } });
  await prisma.agentSchoolAccess.createMany({ data: [{ agentId: first.id, grantedBy: admin.id, schoolId: school.id }, { agentId: second.id, grantedBy: admin.id, schoolId: school.id }] });
  return { admin, building, covered, dormitory, first, pending, school };
}

describe("administrator sweep service", () => {
  it("combines filters and returns newest records first", async () => {
    const data = await fixture();
    const records = await listSweepRecords({ agentId: data.first.id, buildingId: data.building.id, roomNo: "30", schoolId: data.school.id, status: "COVERED" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ agent: { name: "甲代理" }, dormitory: { roomNo: "301" }, status: "COVERED" });
  });

  it("updates with an immutable audit and skips semantic no-ops", async () => {
    const { admin, covered } = await fixture();
    const updated = await updateSweepRecordAsAdmin(covered.id, { customNote: "已复核", expectedRecordId: covered.id, expectedVersion: 1, status: "PENDING" }, admin.id);
    await updateSweepRecordAsAdmin(covered.id, { customNote: "已复核", expectedRecordId: covered.id, expectedVersion: updated.record.version, status: "PENDING" }, admin.id);
    const audits = await listSweepAudits({ action: "UPDATE", recordId: covered.id });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ afterNote: "已复核", afterStatus: "PENDING", beforeNote: "完成", beforeStatus: "COVERED", operator: { id: admin.id } });
  });

  it("snapshots deletion and recalculates covered to pending to unvisited", async () => {
    const { admin, covered, dormitory, pending } = await fixture();
    await deleteSweepRecordAsAdmin(covered.id, 1, admin.id);
    await expect(getDormitoryOverallStatus(dormitory.id)).resolves.toBe("PENDING");
    await deleteSweepRecordAsAdmin(pending.id, 1, admin.id);
    await expect(getDormitoryOverallStatus(dormitory.id)).resolves.toBe("UNVISITED");
    const audits = await listSweepAudits({ action: "DELETE", dormitoryId: dormitory.id });
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ afterNote: null, afterStatus: null, beforeStatus: "PENDING" });
  });

  it("allows exactly one administrator or agent update for one version", async () => {
    const { admin, covered, dormitory, first } = await fixture();
    const outcomes = await Promise.allSettled([
      updateSweepRecordAsAdmin(covered.id, { customNote: "管理员结果", expectedRecordId: covered.id, expectedVersion: 1, status: "PENDING" }, admin.id),
      upsertAgentRecord({ agentId: first.id, customNote: "代理结果", dormitoryId: dormitory.id, expectedRecordId: covered.id, expectedVersion: 1, status: "COVERED" }, { id: first.id, role: "AGENT" }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")[0]).toMatchObject({ reason: { code: "RECORD_CONFLICT", status: 409 } });
    const current = await prisma.sweepRecord.findUniqueOrThrow({ where: { id: covered.id } });
    const audits = await prisma.sweepAudit.findMany({ where: { recordId: covered.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "UPDATE", afterNote: current.note, afterStatus: current.status });
  });

  it("allows exactly one administrator delete or agent update for one version", async () => {
    const { admin, covered, dormitory, first } = await fixture();
    const outcomes = await Promise.allSettled([
      deleteSweepRecordAsAdmin(covered.id, 1, admin.id),
      upsertAgentRecord({ agentId: first.id, customNote: "代理保留", dormitoryId: dormitory.id, expectedRecordId: covered.id, expectedVersion: 1, status: "PENDING" }, { id: first.id, role: "AGENT" }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")[0]).toMatchObject({ reason: { code: "RECORD_CONFLICT", status: 409 } });
    const current = await prisma.sweepRecord.findUnique({ where: { id: covered.id } });
    const audits = await prisma.sweepAudit.findMany({ where: { recordId: covered.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe(current ? "UPDATE" : "DELETE");
    if (current) expect(audits[0]).toMatchObject({ afterNote: current.note, afterStatus: current.status });
  });

  it("rejects stale delete and delete-recreate ABA without a losing audit", async () => {
    const { admin, covered, dormitory, first } = await fixture();
    await upsertAgentRecord({ agentId: first.id, customNote: "新版", dormitoryId: dormitory.id, expectedRecordId: covered.id, expectedVersion: 1, status: "PENDING" }, { id: first.id, role: "AGENT" });
    await expect(deleteSweepRecordAsAdmin(covered.id, 1, admin.id)).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });
    expect(await prisma.sweepAudit.count({ where: { action: "DELETE", recordId: covered.id } })).toBe(0);

    await prisma.sweepRecord.delete({ where: { id: covered.id } });
    const replacement = await prisma.sweepRecord.create({ data: { agentId: first.id, dormitoryId: dormitory.id, note: "替代", status: "COVERED" } });
    await expect(deleteSweepRecordAsAdmin(covered.id, 1, admin.id)).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });
    await expect(prisma.sweepRecord.findUniqueOrThrow({ where: { id: replacement.id } })).resolves.toMatchObject({ note: "替代", version: 1 });
    expect(await prisma.sweepAudit.count({ where: { action: "DELETE", recordId: covered.id } })).toBe(0);
  });
});
