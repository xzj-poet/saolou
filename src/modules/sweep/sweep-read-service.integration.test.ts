import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/api-error";
import { getBuildingMatrixForAgent } from "@/modules/sweep/sweep-read-service";

const prefix = "sweep-read-";
afterEach(async () => {
  const users = await prisma.user.findMany({ select: { id: true }, where: { username: { startsWith: prefix } } }); const userIds = users.map(({ id }) => id);
  const schools = await prisma.school.findMany({ select: { id: true }, where: { name: { startsWith: prefix } } }); const schoolIds = schools.map(({ id }) => id);
  const dorms = await prisma.dormitory.findMany({ select: { id: true }, where: { building: { schoolId: { in: schoolIds } } } }); const dormIds = dorms.map(({ id }) => id);
  await prisma.sweepAudit.deleteMany({ where: { dormitoryId: { in: dormIds } } }); await prisma.sweepRecord.deleteMany({ where: { dormitoryId: { in: dormIds } } });
  await prisma.agentSchoolAccess.deleteMany({ where: { OR: [{ agentId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.dormitory.deleteMany({ where: { id: { in: dormIds } } }); await prisma.building.deleteMany({ where: { schoolId: { in: schoolIds } } }); await prisma.school.deleteMany({ where: { id: { in: schoolIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function fixture() {
  const suffix=randomUUID(); const admin=await prisma.user.create({data:{name:"管理",passwordHash:"x",role:"ADMIN",username:`${prefix}admin-${suffix}`}}); const agent=await prisma.user.create({data:{name:"张三",passwordHash:"x",role:"AGENT",username:`${prefix}agent-${suffix}`}}); const other=await prisma.user.create({data:{name:"李四",passwordHash:"x",role:"AGENT",username:`${prefix}other-${suffix}`}});
  const school=await prisma.school.create({data:{name:`${prefix}${suffix}`}}); const building=await prisma.building.create({data:{name:"3号楼",schoolId:school.id}});
  const dorms=await Promise.all([{floor:"1",roomNo:"101",isActive:true},{floor:"1",roomNo:"102",isActive:true},{floor:"2",roomNo:"201",isActive:true},{floor:"2",roomNo:"202",isActive:false}].map(data=>prisma.dormitory.create({data:{...data,buildingId:building.id}})));
  await prisma.agentSchoolAccess.create({data:{agentId:agent.id,grantedBy:admin.id,schoolId:school.id}});
  await prisma.sweepRecord.createMany({data:[{agentId:other.id,dormitoryId:dorms[0].id,status:"PENDING"},{agentId:agent.id,dormitoryId:dorms[1].id,status:"COVERED"},{agentId:other.id,dormitoryId:dorms[1].id,status:"PENDING"}]});
  return {agent,building,dorms,school};
}

describe("building sweep matrix",()=>{
  it("derives three statuses and marks only the current agent's records",async()=>{const {agent,building,dorms}=await fixture(); const result=await getBuildingMatrixForAgent(agent.id,building.id); expect(result.counts).toEqual({covered:1,pending:1,unvisited:1}); expect(result.floors.flatMap(f=>f.dormitories)).toMatchObject([{id:dorms[2].id,overallStatus:"UNVISITED",hasMyRecord:false},{id:dorms[0].id,overallStatus:"PENDING",hasMyRecord:false},{id:dorms[1].id,overallStatus:"COVERED",hasMyRecord:true}]);});
  it("filters displayed floors without changing building totals",async()=>{const {agent,building}=await fixture(); const result=await getBuildingMatrixForAgent(agent.id,building.id,"1"); expect(result.counts).toEqual({covered:1,pending:1,unvisited:1}); expect(result.floors.map(f=>f.floor)).toEqual(["1"]);});
  it("denies revoked access and inactive ancestors",async()=>{const {agent,building,school}=await fixture(); await prisma.agentSchoolAccess.delete({where:{agentId_schoolId:{agentId:agent.id,schoolId:school.id}}}); await expect(getBuildingMatrixForAgent(agent.id,building.id)).rejects.toMatchObject({code:"SCHOOL_ACCESS_DENIED",status:403} satisfies Partial<ApiError>); await prisma.school.update({data:{isActive:false},where:{id:school.id}}); await expect(getBuildingMatrixForAgent(agent.id,building.id)).rejects.toMatchObject({code:"BUILDING_NOT_FOUND",status:404} satisfies Partial<ApiError>);});
});
