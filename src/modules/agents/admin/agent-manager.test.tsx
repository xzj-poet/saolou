import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentManager } from "@/modules/agents/admin/agent-manager";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const agents = [
  {
    id: "agent-1",
    name: "张三",
    schools: [{ id: "school-1", isActive: true, name: "苏州大学本部" }],
    status: "ACTIVE" as const,
    username: "zhangsan",
  },
];
const schools = [
  { id: "school-1", isActive: true, name: "苏州大学本部" },
  { id: "school-2", isActive: true, name: "苏州大学北区" },
];

describe("AgentManager", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
      ok: true,
    }));
  });

  it("shows account identity, status, school tags, and exactly four menu actions", () => {
    render(<AgentManager agents={agents} schools={schools} />);

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("zhangsan")).toBeInTheDocument();
    expect(screen.getByText("启用中")).toBeInTheDocument();
    expect(screen.getByText("苏州大学本部")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "张三账号操作" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "编辑代理名称",
      "配置学校权限",
      "重置密码",
      "禁用代理",
    ]);
  });

  it("uses the complete school list and allows saving zero access", async () => {
    render(<AgentManager agents={agents} schools={schools} />);
    fireEvent.click(screen.getByRole("button", { name: "张三账号操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "配置学校权限" }));
    const dialog = screen.getByRole("dialog", { name: "配置张三的学校权限" });
    expect(within(dialog).getByRole("checkbox", { name: "苏州大学本部" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "苏州大学北区" })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "苏州大学本部" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "保存学校权限" }));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/admin/agents/agent-1/school-access",
      expect.objectContaining({ body: JSON.stringify({ schoolIds: [] }), method: "PUT" }),
    ));
  });

  it("allows removing a retained inactive grant but prevents adding a new inactive school", () => {
    render(<AgentManager
      agents={[{
        ...agents[0],
        schools: [{ id: "school-inactive-granted", isActive: false, name: "已停用旧授权" }],
      }]}
      schools={[
        { id: "school-inactive-granted", isActive: false, name: "已停用旧授权" },
        { id: "school-inactive-new", isActive: false, name: "已停用未授权" },
      ]}
    />);
    fireEvent.click(screen.getByRole("button", { name: "张三账号操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "配置学校权限" }));
    const dialog = screen.getByRole("dialog", { name: "配置张三的学校权限" });

    expect(within(dialog).getByRole("checkbox", { name: "已停用旧授权" })).toBeEnabled();
    expect(within(dialog).getByRole("checkbox", { name: "已停用未授权" })).toBeDisabled();
  });

  it("keeps a generated password only in the current create dialog", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ agent: { id: "agent-2" }, temporaryPassword: "Abcd2345!efgh678" }),
      ok: true,
    } as Response);
    render(<AgentManager agents={agents} schools={schools} />);
    fireEvent.click(screen.getByRole("button", { name: /创建代理/ }));
    fireEvent.change(screen.getByLabelText("代理名称"), { target: { value: "李四" } });
    fireEvent.change(screen.getByLabelText("登录账号"), { target: { value: "lisi" } });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByText("Abcd2345!efgh678")).toBeInTheDocument();
    expect(screen.getByText("此密码只展示一次，请立即复制并安全交给代理。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制密码" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭创建代理" }));
    fireEvent.click(screen.getByRole("button", { name: /创建代理/ }));
    expect(screen.queryByText("Abcd2345!efgh678")).not.toBeInTheDocument();
  });
});
