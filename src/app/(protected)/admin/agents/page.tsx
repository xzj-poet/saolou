import { listAgentsForAdmin } from "@/modules/agents/agent-admin-service";
import { AgentManager } from "@/modules/agents/admin/agent-manager";
import { listCampusTreeForAdmin } from "@/modules/campus/campus-read-service";

export default async function AgentsPage() {
  const [agents, campus] = await Promise.all([listAgentsForAdmin(), listCampusTreeForAdmin()]);
  return (
    <AgentManager
      agents={agents}
      schools={campus.map(({ id, isActive, name }) => ({ id, isActive, name }))}
    />
  );
}
