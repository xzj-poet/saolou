import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider } from "@/components/unsaved-changes-provider";
import { RecordEditor } from "@/modules/sweep/agent/record-editor";

const navigation = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const notes = [
  { content: "晚点再来", id: "p1", status: "PENDING" as const },
  { content: "已完成宣传", id: "c1", status: "COVERED" as const },
];

const createDormitory = { expectedRecordId: null, expectedVersion: null, id: "d1", roomNo: "101" };
const editDormitory = { expectedRecordId: "r1", expectedVersion: 3, id: "d1", roomNo: "101" };

function submittedBody(fetchMock: ReturnType<typeof vi.spyOn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as unknown;
}

function renderEditor(props: Partial<React.ComponentProps<typeof RecordEditor>> = {}) {
  return render(<UnsavedChangesProvider><RecordEditor
    backHref="/back"
    buildingId="b1"
    dormitories={[createDormitory]}
    floor="1"
    mode="create"
    quickNotes={notes}
    title="记录 101"
    {...props}
  /></UnsavedChangesProvider>);
}

function chooseNote(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /快捷备注/ }));
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("RecordEditor", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.refresh.mockReset();
    navigation.replace.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts create and batch editors empty and disables save until status selection", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "待补扫" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "已覆盖" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "保存记录" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    expect(screen.getByRole("button", { name: "保存记录" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: "晚点再来" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /选择快捷备注/ }));
    expect(screen.getByRole("option", { name: "晚点再来" })).toBeInTheDocument();
  });

  it("sends the selected shortcut and concurrency token", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    chooseNote("晚点再来");
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith("/api/dormitories/d1/my-record", expect.objectContaining({ method: "PUT" }));
    expect(submittedBody(fetchMock)).toEqual({ expectedRecordId: null, expectedVersion: null, quickNoteId: "p1", status: "PENDING" });
  });

  it("preserves the draft on conflict and loads the latest server record and token", async () => {
    const conflict = {
      error: {
        code: "RECORD_CONFLICT",
        fields: { conflicts: [{
          currentRecord: { id: "r2", note: "服务端新版", status: "COVERED", updatedAt: "2026-10-04T10:00:00.000Z", version: 4 },
          dormitoryId: "d1",
          reason: "UPDATED",
          roomNo: "101",
        }] },
        message: "记录已被其他操作更新，请加载最新内容后确认",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(conflict), { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    renderEditor({ dormitories: [editDormitory], initialNote: "旧值", initialStatus: "PENDING", mode: "edit", title: "编辑 101" });
    chooseNote("自定义备注");
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), { target: { value: "我的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));

    await screen.findByText("记录已被其他操作更新，请加载最新内容后确认");
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("我的草稿");
    expect(screen.getByText(/服务端新版/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载最新记录" }));
    expect(screen.getByRole("button", { name: "已覆盖" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("服务端新版");

    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(submittedBody(fetchMock, 1)).toMatchObject({ expectedRecordId: "r2", expectedVersion: 4, status: "COVERED" });
  });

  it("shows saved feedback for 800ms before returning", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await act(async () => Promise.resolve());
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(799));
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigation.replace).toHaveBeenCalledWith("/app/buildings/b1?floor=1");
  });

  it("keeps input after a network failure and offers an explicit retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    renderEditor({ dormitories: [editDormitory], initialNote: "旧值", initialStatus: "PENDING", mode: "edit", title: "编辑 101" });
    chooseNote("自定义备注");
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), { target: { value: "敲门无人应答" } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await screen.findByText("尚未保存，请检查网络后重新保存");
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("敲门无人应答");
    fireEvent.click(screen.getByRole("button", { name: "重新保存" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("confirms internal back navigation while dirty", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(navigation.push).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(navigation.push).toHaveBeenCalledWith("/back");
  });

  it("posts all selected dormitory concurrency targets in batch mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    renderEditor({ dormitories: [{ ...createDormitory }, { expectedRecordId: "r2", expectedVersion: 4, id: "d2", roomNo: "102" }], mode: "batch", title: "标记 101、102" });
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    chooseNote("无备注");
    fireEvent.click(screen.getByRole("button", { name: "保存2间宿舍" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sweep-records/batch", expect.objectContaining({ method: "POST" })));
    expect(submittedBody(fetchMock)).toEqual({ buildingId: "b1", targets: [{ dormitoryId: "d1", expectedRecordId: null, expectedVersion: null }, { dormitoryId: "d2", expectedRecordId: "r2", expectedVersion: 4 }], customNote: null, status: "PENDING" });
  });

  it("lists every batch conflict and refreshes without discarding the draft", async () => {
    const conflict = { error: { code: "RECORD_CONFLICT", fields: { conflicts: [
      { currentRecord: { id: "r1", note: "新 101", status: "COVERED", version: 2 }, dormitoryId: "d1", reason: "CREATED", roomNo: "101" },
      { currentRecord: { id: "r2", note: "新 102", status: "PENDING", version: 5 }, dormitoryId: "d2", reason: "UPDATED", roomNo: "102" },
    ] }, message: "记录已被其他操作更新" } };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(conflict), { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    renderEditor({ dormitories: [{ ...createDormitory }, { ...editDormitory, id: "d2", roomNo: "102" }], mode: "batch", title: "标记 101、102" });
    fireEvent.click(screen.getByRole("button", { name: "待补扫" }));
    chooseNote("自定义备注");
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), { target: { value: "批量草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存2间宿舍" }));
    await screen.findByText(/101 最新记录/);
    expect(screen.getByText(/102 最新记录/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("批量草稿");
    fireEvent.click(screen.getByRole("button", { name: "刷新最新记录" }));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("批量草稿");
    fireEvent.click(screen.getByRole("button", { name: "保存2间宿舍" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(submittedBody(fetchMock, 1)).toMatchObject({ targets: [
      { dormitoryId: "d1", expectedRecordId: "r1", expectedVersion: 2 },
      { dormitoryId: "d2", expectedRecordId: "r2", expectedVersion: 5 },
    ] });
  });
});
