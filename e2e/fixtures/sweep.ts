import { randomUUID } from "node:crypto";

import { prisma } from "../../src/lib/db";
import { hashPassword } from "../../src/modules/auth/password";
import { expect, test as authTest } from "./auth";

export type SweepScenario = {
  buildingId: string;
  coveredNote: string;
  dormitoryIds: Record<"201" | "202", string>;
  pendingNote: string;
  schoolId: string;
  schoolName: string;
  secondAgent: { id: string; password: string; username: string };
};

export const test = authTest.extend<{ sweepScenario: SweepScenario }>({
  sweepScenario: async ({ authUsers }, runScenario, testInfo) => {
    const suffix = `${testInfo.project.name}-${randomUUID()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const [admin, firstAgent] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: authUsers.admin.username } }),
      prisma.user.findUniqueOrThrow({ where: { username: authUsers.agent.username } }),
    ]);
    const secondPassword = "E2e-password-456";
    const secondAgent = await prisma.user.create({ data: { name: "第二代理", passwordHash: await hashPassword(secondPassword), role: "AGENT", username: `sweep-agent-${suffix}` } });
    const school = await prisma.school.create({ data: { name: `扫楼验收学校-${suffix}` } });
    const building = await prisma.building.create({ data: { name: "验收3号楼", schoolId: school.id } });
    const rooms = await Promise.all(["201", "202"].map((roomNo, index) => prisma.dormitory.create({ data: { buildingId: building.id, floor: "2", roomNo, sortOrder: index } })));
    await prisma.agentSchoolAccess.createMany({ data: [firstAgent.id, secondAgent.id].map(agentId => ({ agentId, grantedBy: admin.id, schoolId: school.id })) });
    const scenario: SweepScenario = {
      buildingId: building.id,
      coveredNote: `验收已覆盖-${suffix.slice(-6)}`,
      dormitoryIds: { "201": rooms[0].id, "202": rooms[1].id },
      pendingNote: `验收待补扫-${suffix.slice(-6)}`,
      schoolId: school.id,
      schoolName: school.name,
      secondAgent: { id: secondAgent.id, password: secondPassword, username: secondAgent.username },
    };
    await prisma.quickNote.createMany({ data: [
      { content: scenario.pendingNote, status: "PENDING" },
      { content: scenario.coveredNote, status: "COVERED" },
    ] });

    try {
      await runScenario(scenario);
    } finally {
      await prisma.session.deleteMany({ where: { userId: secondAgent.id } });
      await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: rooms.map(({ id }) => id) } } });
      await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: rooms.map(({ id }) => id) } } });
      await prisma.agentSchoolAccess.deleteMany({ where: { schoolId: school.id } });
      await prisma.dormitory.deleteMany({ where: { buildingId: building.id } });
      await prisma.building.delete({ where: { id: building.id } });
      await prisma.school.delete({ where: { id: school.id } });
      await prisma.quickNote.deleteMany({ where: { content: { in: [scenario.pendingNote, scenario.coveredNote] } } });
      await prisma.user.delete({ where: { id: secondAgent.id } });
    }
  },
});

export { expect };
