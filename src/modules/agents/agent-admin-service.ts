import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { hashPassword } from "@/modules/auth/password";
import { generateTemporaryPassword } from "@/modules/agents/temporary-password";

type AgentCreateInput = { name: string; username: string };
type AgentStatus = "ACTIVE" | "DISABLED";
const accessQueues = new Map<string, Promise<void>>();

function uniqueError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function retryableTransactionError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function assertAgent(agentId: string) {
  const agent = await prisma.user.findFirst({ select: { id: true }, where: { id: agentId, role: "AGENT" } });
  if (!agent) throw new ApiError(404, "AGENT_NOT_FOUND", "代理账号不存在");
  return agent;
}

export async function listAgentsForAdmin() {
  const agents = await prisma.user.findMany({
    include: {
      schoolAccess: {
        include: { school: { select: { id: true, isActive: true, name: true } } },
        orderBy: { school: { name: "asc" } },
      },
    },
    orderBy: [{ createdAt: "asc" }, { username: "asc" }],
    where: { role: "AGENT" },
  });
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    schools: agent.schoolAccess.map(({ school }) => school),
    status: agent.status,
    username: agent.username,
  }));
}

export async function createAgent(_administratorId: string, input: AgentCreateInput) {
  const temporaryPassword = generateTemporaryPassword();
  try {
    const agent = await prisma.user.create({
      data: {
        name: input.name.trim(),
        passwordHash: await hashPassword(temporaryPassword),
        role: "AGENT",
        username: input.username.trim().toLowerCase(),
      },
    });
    return { agent, temporaryPassword };
  } catch (error) {
    if (uniqueError(error)) throw new ApiError(409, "USERNAME_CONFLICT", "登录账号已存在");
    throw error;
  }
}

export async function renameAgent(agentId: string, input: { name: string }) {
  await assertAgent(agentId);
  return prisma.user.update({ data: { name: input.name.trim() }, where: { id: agentId } });
}

export async function setAgentStatus(agentId: string, status: AgentStatus) {
  await assertAgent(agentId);
  return prisma.$transaction(async (tx) => {
    const agent = await tx.user.update({ data: { status }, where: { id: agentId } });
    if (status === "DISABLED") await tx.session.deleteMany({ where: { userId: agentId } });
    return agent;
  });
}

export async function resetAgentPassword(agentId: string) {
  await assertAgent(agentId);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ data: { passwordHash }, where: { id: agentId } });
    await tx.session.deleteMany({ where: { userId: agentId } });
  });
  return { temporaryPassword };
}

export async function replaceAgentSchoolAccess(
  agentId: string,
  schoolIds: string[],
  grantedBy: string,
) {
  const previous = accessQueues.get(agentId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  accessQueues.set(agentId, queued);
  await previous;
  try {
    await assertAgent(agentId);
    if (new Set(schoolIds).size !== schoolIds.length) {
      throw new ApiError(400, "DUPLICATE_SCHOOL_IDS", "学校权限列表包含重复项");
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const schools = await tx.school.findMany({
              select: { id: true, isActive: true },
              where: { id: { in: schoolIds } },
            });
            if (schools.length !== schoolIds.length) {
              throw new ApiError(400, "INVALID_SCHOOL_ACCESS", "所选学校不存在");
            }
            const inactiveIds = schools.filter(({ isActive }) => !isActive).map(({ id }) => id);
            if (inactiveIds.length > 0) {
              const retainedInactive = await tx.agentSchoolAccess.count({
                where: { agentId, schoolId: { in: inactiveIds } },
              });
              if (retainedInactive !== inactiveIds.length) {
                throw new ApiError(400, "INVALID_SCHOOL_ACCESS", "不能新增已停用学校的权限");
              }
            }
            await tx.agentSchoolAccess.deleteMany({
              where: { agentId, ...(schoolIds.length ? { schoolId: { notIn: schoolIds } } : {}) },
            });
            if (schoolIds.length > 0) {
              await tx.agentSchoolAccess.createMany({
                data: schoolIds.map((schoolId) => ({ agentId, grantedBy, schoolId })),
                skipDuplicates: true,
              });
            }
          },
          { isolationLevel: "Serializable" },
        );
        return;
      } catch (error) {
        if (!retryableTransactionError(error) || attempt === 2) throw error;
      }
    }
  } finally {
    release();
    if (accessQueues.get(agentId) === queued) accessQueues.delete(agentId);
  }
}
