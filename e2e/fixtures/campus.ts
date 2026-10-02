import { randomUUID } from "node:crypto";

import { prisma } from "../../src/lib/db";
import { expect, test as authTest } from "./auth";

export type CampusScenario = {
  agentName: string;
  agentUsername: string;
  buildingName: string;
  schoolName: string;
};

export const test = authTest.extend<{ campusScenario: CampusScenario }>({
  campusScenario: async ({}, runScenario, testInfo) => {
    const suffix = `${testInfo.project.name}-${randomUUID()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const scenario = {
      agentName: `扫楼代理-${suffix.slice(-8)}`,
      agentUsername: `campus-agent-${suffix}`,
      buildingName: "3号楼",
      schoolName: `验收学校-${suffix}`,
    };

    await runScenario(scenario);

    const schools = await prisma.school.findMany({ where: { name: scenario.schoolName }, select: { id: true } });
    const schoolIds = schools.map(({ id }) => id);
    const buildings = await prisma.building.findMany({ where: { schoolId: { in: schoolIds } }, select: { id: true } });
    const buildingIds = buildings.map(({ id }) => id);
    const dormitories = await prisma.dormitory.findMany({ where: { buildingId: { in: buildingIds } }, select: { id: true } });
    const dormitoryIds = dormitories.map(({ id }) => id);
    const agents = await prisma.user.findMany({ where: { username: scenario.agentUsername }, select: { id: true } });
    const agentIds = agents.map(({ id }) => id);

    await prisma.sweepAudit.deleteMany({
      where: { OR: [{ dormitoryId: { in: dormitoryIds } }, { agentId: { in: agentIds } }, { operatorId: { in: agentIds } }] },
    });
    await prisma.sweepRecord.deleteMany({
      where: { OR: [{ dormitoryId: { in: dormitoryIds } }, { agentId: { in: agentIds } }] },
    });
    await prisma.agentSchoolAccess.deleteMany({
      where: { OR: [{ agentId: { in: agentIds } }, { schoolId: { in: schoolIds } }] },
    });
    await prisma.dormitory.deleteMany({ where: { buildingId: { in: buildingIds } } });
    await prisma.building.deleteMany({ where: { id: { in: buildingIds } } });
    await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: agentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: agentIds } } });
  },
});

export { expect };
