import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SweepDataManager } from "@/modules/sweep/admin/sweep-data-manager";

const navigation = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const record = { agent: { id: "a1", name: "张三" }, agentId: "a1", dormitory: { building: { id: "b1", name: "3号楼", school: { id: "s1", name: "本部" } }, floor: "2", id: "d1", roomNo: "201" }, id: "r1", note: "无人", status: "PENDING" as const, updatedAt: new Date("2026-10-02T10:00:00Z") };
const audit = { action: "UPDATE" as const, afterNote: "完成", afterStatus: "COVERED" as const, agent: record.agent, beforeNote: "无人", beforeStatus: "PENDING" as const, createdAt: new Date("2026-10-03T10:00:00Z"), dormitory: record.dormitory, id: "u1", operator: { id: "admin", name: "管理员" }, recordId: "r1" };

describe("SweepDataManager", () => {
  beforeEach(() => { navigation.refresh.mockReset(); vi.restoreAllMocks(); });

  it("offers five filters and read-only audit snapshots", () => {
    render(<SweepDataManager audits={[audit]} records={[record]} />);
    expect(screen.getByLabelText("学校")).toBeInTheDocument();
    expect(screen.getByLabelText("楼栋")).toBeInTheDocument();
    expect(screen.getByLabelText("房号")).toBeInTheDocument();
    expect(screen.getByLabelText("代理")).toBeInTheDocument();
    expect(screen.getByLabelText("状态")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "审计记录" }));
    expect(screen.getByText("无人 → 完成")).toBeInTheDocument();
    expect(screen.getByText("审计记录只读，不可修改或删除")).toBeInTheDocument();
  });

  it("edits a record and refreshes after success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<SweepDataManager audits={[]} records={[record]} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑 201" }));
    fireEvent.click(screen.getByRole("button", { name: "已覆盖" }));
    fireEvent.change(screen.getByRole("textbox", { name: "管理员备注" }), { target: { value: "复核完成" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/sweep-records/r1", expect.objectContaining({ body: JSON.stringify({ customNote: "复核完成", status: "COVERED" }), method: "PUT" })));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("requires explicit confirmation before dangerous deletion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<SweepDataManager audits={[]} records={[record]} />);
    fireEvent.click(screen.getByRole("button", { name: "删除 201" }));
    expect(screen.getByText("删除后只能从审计记录追溯，不能恢复当前记录。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认永久删除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/sweep-records/r1", expect.objectContaining({ method: "DELETE" })));
  });
});
