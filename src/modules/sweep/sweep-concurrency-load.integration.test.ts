import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { POST as postBatch } from "@/app/api/sweep-records/batch/route";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/http/rate-limit";
import { createSession } from "@/modules/auth/session-repository";
import { getBuildingMatrixForAgent } from "@/modules/sweep/sweep-read-service";

const origin = "http://localhost";
const prefix = "concurrency-load-";
let cleanupSchoolId: string | null = null;
let cleanupBuildingId: string | null = null;

afterEach(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.sweepAudit.deleteMany({ where: { agentId: { in: userIds } } });
    await prisma.sweepRecord.deleteMany({ where: { agentId: { in: userIds } } });
    await prisma.agentSchoolAccess.deleteMany({ where: { agentId: { in: userIds } } });
  }
  if (cleanupBuildingId) await prisma.dormitory.deleteMany({ where: { buildingId: cleanupBuildingId } });
  if (cleanupBuildingId) await prisma.building.deleteMany({ where: { id: cleanupBuildingId } });
  if (cleanupSchoolId) await prisma.school.deleteMany({ where: { id: cleanupSchoolId } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  cleanupSchoolId = null;
  cleanupBuildingId = null;
});

describe("20-agent sweep concurrency smoke", () => {
  it("writes one building concurrently without duplicate records, incorrect counts, or rate limiting", async () => {
    resetRateLimitsForTests();
    const suffix = randomUUID();
    const admin = await prisma.user.create({ data: { name: "负载管理员", passwordHash: "unused", role: "ADMIN", username: `${prefix}admin-${suffix}` } });
    const agents = await Promise.all(Array.from({ length: 20 }, (_, index) => prisma.user.create({ data: { name: `代理 ${index + 1}`, passwordHash: "unused", role: "AGENT", username: `${prefix}${index}-${suffix}` } })));
    const school = await prisma.school.create({ data: { name: `${prefix}${suffix}` } });
    cleanupSchoolId = school.id;
    const building = await prisma.building.create({ data: { name: "并发楼", schoolId: school.id } });
    cleanupBuildingId = building.id;
    const rooms = await Promise.all(Array.from({ length: 5 }, (_, index) => prisma.dormitory.create({ data: { buildingId: building.id, floor: "1", roomNo: `10${index + 1}`, sortOrder: index } })));
    await prisma.agentSchoolAccess.createMany({ data: agents.map((agent) => ({ agentId: agent.id, grantedBy: admin.id, schoolId: school.id })) });
    const sessions = await Promise.all(agents.map((agent) => createSession(agent.id)));
    const body = { buildingId: building.id, status: "PENDING", targets: rooms.map((room) => ({ dormitoryId: room.id, expectedRecordId: null, expectedVersion: null })) };

    const startedAt = performance.now();
    const responses = await Promise.all(sessions.map((session) => postBatch(new Request(`${origin}/api/sweep-records/batch`, {
      body: JSON.stringify(body),
      headers: { Cookie: `campus_sweep_session=${session.token}`, "Content-Type": "application/json", Origin: origin },
      method: "POST",
    }))));
    const elapsedMs = performance.now() - startedAt;

    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    expect(responses.some((response) => response.status === 429)).toBe(false);
    expect(elapsedMs).toBeLessThan(10_000);
    expect(await prisma.sweepRecord.count({ where: { dormitoryId: { in: rooms.map(({ id }) => id) } } })).toBe(100);
    expect(await prisma.sweepAudit.count({ where: { dormitoryId: { in: rooms.map(({ id }) => id) } } })).toBe(100);
    const unique = await prisma.sweepRecord.groupBy({ by: ["agentId", "dormitoryId"], _count: { _all: true }, where: { dormitoryId: { in: rooms.map(({ id }) => id) } } });
    expect(unique).toHaveLength(100);
    expect(unique.every((row) => row._count._all === 1)).toBe(true);
    await expect(getBuildingMatrixForAgent(agents[0].id, building.id)).resolves.toMatchObject({ counts: { covered: 0, pending: 5, unvisited: 0 } });
  }, 30_000);
});
