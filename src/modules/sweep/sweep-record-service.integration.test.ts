import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { createQuickNote, setQuickNoteActive, updateQuickNote } from "@/modules/quick-notes/quick-note-service";
import { getDormitoryOverallStatus, upsertAgentRecord } from "@/modules/sweep/sweep-record-service";

const prefix = "sweep-core-";

afterEach(async () => {
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } });
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const schoolIds = schools.map(({ id }) => id);
  const userIds = users.map(({ id }) => id);
  const dormitories = await prisma.dormitory.findMany({ select: { id: true }, where: { building: { schoolId: { in: schoolIds } } } });
  const dormitoryIds = dormitories.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: dormitoryIds } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.dormitory.deleteMany({ where: { id: { in: dormitoryIds } } });
  await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.quickNote.deleteMany({ where: { content: { startsWith: prefix } } });
});

async function fixture() {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { name: "管理员", passwordHash: "test", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
  const agent = await prisma.user.create({ data: { name: "张三", passwordHash: "test", role: "AGENT", username: `${prefix}agent-${suffix}` } });
  const otherAgent = await prisma.user.create({ data: { name: "李四", passwordHash: "test", role: "AGENT", username: `${prefix}other-${suffix}` } });
  const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } });
  const building = await prisma.building.create({ data: { name: "3号楼", schoolId: school.id } });
  const dormitory = await prisma.dormitory.create({ data: { buildingId: building.id, floor: "2", roomNo: "201" } });
  await prisma.agentSchoolAccess.createMany({ data: [
    { agentId: agent.id, grantedBy: admin.id, schoolId: school.id },
    { agentId: otherAgent.id, grantedBy: admin.id, schoolId: school.id },
  ] });
  return { admin, agent, building, dormitory, otherAgent, school };
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error("Expected ApiError.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("sweep record service", () => {
  it("creates and updates one current record with immutable audit snapshots", async () => {
    const { agent, dormitory } = await fixture();
    const quickNote = await createQuickNote({ content: `${prefix}敲门无人`, status: "PENDING" });

    const created = await upsertAgentRecord({ agentId: agent.id, dormitoryId: dormitory.id, expectedRecordId: null, expectedVersion: null, quickNoteId: quickNote.id, status: "PENDING" }, { id: agent.id, role: "AGENT" });
    expect(created).toMatchObject({ changed: true, overallStatus: "PENDING", record: { note: `${prefix}敲门无人`, status: "PENDING", version: 1 } });
    await updateQuickNote(quickNote.id, { content: `${prefix}已经修改` });

    const updated = await upsertAgentRecord({ agentId: agent.id, customNote: "  已完成覆盖  ", dormitoryId: dormitory.id, expectedRecordId: created.record.id, expectedVersion: 1, status: "COVERED" }, { id: agent.id, role: "AGENT" });
    expect(updated).toMatchObject({ changed: true, overallStatus: "COVERED", record: { note: "已完成覆盖", status: "COVERED", version: 2 } });
    expect(await prisma.sweepRecord.count({ where: { agentId: agent.id, dormitoryId: dormitory.id } })).toBe(1);
    expect(await prisma.sweepAudit.findMany({ orderBy: { createdAt: "asc" }, where: { agentId: agent.id, dormitoryId: dormitory.id } })).toMatchObject([
      { action: "CREATE", afterNote: `${prefix}敲门无人`, afterStatus: "PENDING", beforeNote: null, beforeStatus: null, operatorId: agent.id },
      { action: "UPDATE", afterNote: "已完成覆盖", afterStatus: "COVERED", beforeNote: `${prefix}敲门无人`, beforeStatus: "PENDING", operatorId: agent.id },
    ]);
  });

  it("does not update timestamps or audits for a semantic no-op and derives status priority", async () => {
    const { agent, dormitory, otherAgent } = await fixture();
    const first = await upsertAgentRecord({ agentId: agent.id, customNote: "稍后再来", dormitoryId: dormitory.id, expectedRecordId: null, expectedVersion: null, status: "PENDING" }, { id: agent.id, role: "AGENT" });
    const unchanged = await upsertAgentRecord({ agentId: agent.id, customNote: "  稍后再来  ", dormitoryId: dormitory.id, expectedRecordId: first.record.id, expectedVersion: 1, status: "PENDING" }, { id: agent.id, role: "AGENT" });
    expect(unchanged).toMatchObject({ changed: false, record: { id: first.record.id, updatedAt: first.record.updatedAt, version: 1 } });
    expect(await prisma.sweepAudit.count({ where: { recordId: first.record.id } })).toBe(1);

    await upsertAgentRecord({ agentId: otherAgent.id, customNote: "已覆盖", dormitoryId: dormitory.id, expectedRecordId: null, expectedVersion: null, status: "COVERED" }, { id: otherAgent.id, role: "AGENT" });
    await expect(getDormitoryOverallStatus(dormitory.id)).resolves.toBe("COVERED");
  });

  it("rejects invalid note choices, forged ownership, revoked access, and inactive targets", async () => {
    const { agent, building, dormitory, otherAgent, school } = await fixture();
    const pending = await createQuickNote({ content: `${prefix}待补扫`, status: "PENDING" });
    const disabled = await createQuickNote({ content: `${prefix}已停用`, status: "PENDING" });
    await setQuickNoteActive(disabled.id, false);

    const expectation = { expectedRecordId: null, expectedVersion: null };
    await expectApiError(upsertAgentRecord({ agentId: agent.id, customNote: "自定义", dormitoryId: dormitory.id, ...expectation, quickNoteId: pending.id, status: "PENDING" }, { id: agent.id, role: "AGENT" }), 400, "VALIDATION_ERROR");
    await expectApiError(upsertAgentRecord({ agentId: agent.id, dormitoryId: dormitory.id, ...expectation, quickNoteId: pending.id, status: "COVERED" }, { id: agent.id, role: "AGENT" }), 400, "QUICK_NOTE_INVALID");
    await expectApiError(upsertAgentRecord({ agentId: agent.id, dormitoryId: dormitory.id, ...expectation, quickNoteId: disabled.id, status: "PENDING" }, { id: agent.id, role: "AGENT" }), 400, "QUICK_NOTE_INVALID");
    await expectApiError(upsertAgentRecord({ agentId: otherAgent.id, dormitoryId: dormitory.id, ...expectation, status: "PENDING" }, { id: agent.id, role: "AGENT" }), 403, "RECORD_OWNERSHIP_DENIED");

    await prisma.agentSchoolAccess.delete({ where: { agentId_schoolId: { agentId: agent.id, schoolId: school.id } } });
    await expectApiError(upsertAgentRecord({ agentId: agent.id, dormitoryId: dormitory.id, ...expectation, status: "PENDING" }, { id: agent.id, role: "AGENT" }), 403, "SCHOOL_ACCESS_DENIED");
    await prisma.building.update({ data: { isActive: false }, where: { id: building.id } });
    await expectApiError(upsertAgentRecord({ agentId: otherAgent.id, dormitoryId: dormitory.id, ...expectation, status: "PENDING" }, { id: otherAgent.id, role: "AGENT" }), 404, "DORMITORY_NOT_FOUND");
  });

  it("rejects stale same-content and delete-recreate ABA submissions", async () => {
    const { agent, dormitory } = await fixture();
    const operator = { id: agent.id, role: "AGENT" as const };
    const created = await upsertAgentRecord({ agentId: agent.id, customNote: "初始", dormitoryId: dormitory.id, expectedRecordId: null, expectedVersion: null, status: "PENDING" }, operator);
    const updated = await upsertAgentRecord({ agentId: agent.id, customNote: "最新", dormitoryId: dormitory.id, expectedRecordId: created.record.id, expectedVersion: 1, status: "COVERED" }, operator);

    await expect(upsertAgentRecord({ agentId: agent.id, customNote: "最新", dormitoryId: dormitory.id, expectedRecordId: created.record.id, expectedVersion: 1, status: "COVERED" }, operator)).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });

    await prisma.sweepRecord.delete({ where: { id: updated.record.id } });
    const replacement = await prisma.sweepRecord.create({ data: { agentId: agent.id, dormitoryId: dormitory.id, note: "替代", status: "PENDING" } });
    expect(replacement.version).toBe(1);
    await expect(upsertAgentRecord({ agentId: agent.id, customNote: "旧页面", dormitoryId: dormitory.id, expectedRecordId: created.record.id, expectedVersion: 1, status: "PENDING" }, operator)).rejects.toMatchObject({ code: "RECORD_CONFLICT", status: 409 });
  });

  it("serializes concurrent creates into one success and one conflict", async () => {
    const { agent, dormitory } = await fixture();
    const input = { agentId: agent.id, customNote: "并发结果", dormitoryId: dormitory.id, expectedRecordId: null, expectedVersion: null, status: "PENDING" as const };
    const operator = { id: agent.id, role: "AGENT" as const };

    const results = await Promise.allSettled([upsertAgentRecord(input, operator), upsertAgentRecord(input, operator)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "RECORD_CONFLICT", status: 409 } });
    expect(await prisma.sweepRecord.count({ where: { agentId: agent.id, dormitoryId: dormitory.id } })).toBe(1);
    expect(await prisma.sweepAudit.count({ where: { agentId: agent.id, dormitoryId: dormitory.id, action: "CREATE" } })).toBe(1);
  });
});
