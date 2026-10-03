import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickNoteManager } from "@/modules/quick-notes/admin/quick-note-manager";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const notes = [
  { content: "只有少量人在", id: "pending-1", isActive: true, sortOrder: 0, status: "PENDING" as const },
  { content: "稍后再来", id: "pending-2", isActive: false, sortOrder: 1, status: "PENDING" as const },
  { content: "已完成覆盖", id: "covered-1", isActive: true, sortOrder: 0, status: "COVERED" as const },
];

describe("QuickNoteManager", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}), ok: true }));
  });

  it("switches status groups and shows order and active state", () => {
    render(<QuickNoteManager quickNotes={notes} />);
    expect(screen.getByRole("tab", { name: "待补扫（2）" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("只有少量人在")).toBeInTheDocument();
    expect(screen.getByText("已停用")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "已覆盖（1）" }));
    expect(screen.getByText("已完成覆盖")).toBeInTheDocument();
    expect(screen.queryByText("只有少量人在")).not.toBeInTheDocument();
  });

  it("creates and edits notes through the real API contract", async () => {
    render(<QuickNoteManager quickNotes={notes} />);
    fireEvent.click(screen.getByRole("button", { name: "新增待补扫快捷备注" }));
    fireEvent.change(screen.getByLabelText("快捷备注内容"), { target: { value: "无人回应" } });
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/quick-notes", expect.objectContaining({ body: JSON.stringify({ content: "无人回应", status: "PENDING" }), method: "POST" })));

    fireEvent.click(screen.getByRole("button", { name: "只有少量人在的备注操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑备注" }));
    const dialog = screen.getByRole("dialog", { name: "编辑快捷备注" });
    fireEvent.change(within(dialog).getByLabelText("快捷备注内容"), { target: { value: "晚上再来" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/quick-notes/pending-1", expect.objectContaining({ body: JSON.stringify({ content: "晚上再来" }), method: "PATCH" })));
  });

  it("reorders, toggles, and confirms dangerous deletion without changing historical text", async () => {
    render(<QuickNoteManager quickNotes={notes} />);
    fireEvent.click(screen.getByRole("button", { name: "下移只有少量人在" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/quick-notes/reorder", expect.objectContaining({ body: JSON.stringify({ orderedIds: ["pending-2", "pending-1"], status: "PENDING" }), method: "PUT" })));

    fireEvent.click(screen.getByRole("button", { name: "稍后再来的备注操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "启用备注" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/quick-notes/pending-2", expect.objectContaining({ body: JSON.stringify({ isActive: true }), method: "PATCH" })));

    fireEvent.click(screen.getByRole("button", { name: "只有少量人在的备注操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除备注" }));
    expect(screen.getByText("已经保存到扫楼记录和审计中的备注文字不会改变。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/quick-notes/pending-1", expect.objectContaining({ method: "DELETE" })));
  });
});
