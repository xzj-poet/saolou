import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordEditor } from "@/modules/sweep/agent/record-editor";

const navigation = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const notes = [
  { content: "晚点再来", id: "p1", status: "PENDING" as const },
  { content: "已完成宣传", id: "c1", status: "COVERED" as const },
];

function submittedBody(fetchMock: ReturnType<typeof vi.spyOn>) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as unknown;
}

describe("RecordEditor", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    vi.restoreAllMocks();
  });

  it("filters shortcuts by status and saves a shortcut snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<RecordEditor backHref="/back" buildingId="b1" dormitories={[{ expectedRecordId: null, expectedVersion: null, id: "d1", roomNo: "101" }]} floor="1" mode="create" quickNotes={notes} title="记录 101" />);
    expect(screen.getByRole("button", { name: "晚点再来" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已完成宣传" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "晚点再来" }));
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dormitories/d1/my-record", expect.objectContaining({ method: "PUT" })));
    expect(submittedBody(fetchMock)).toEqual({ expectedRecordId: null, expectedVersion: null, quickNoteId: "p1", status: "PENDING" });
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app/buildings/b1?floor=1"));
  });

  it("keeps custom text after a failed save and can switch status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "保存失败" } }), { status: 500 }));
    render(<RecordEditor backHref="/back" buildingId="b1" dormitories={[{ expectedRecordId: "r1", expectedVersion: 3, id: "d1", roomNo: "101" }]} floor="1" mode="edit" quickNotes={notes} title="编辑 101" />);
    fireEvent.click(screen.getByRole("button", { name: "已覆盖" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义备注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "备注" }), { target: { value: "敲门无人应答" } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    await screen.findByText("保存失败");
    expect(fetchMock).toHaveBeenCalledWith("/api/dormitories/d1/my-record", expect.objectContaining({ method: "PUT" }));
    expect(submittedBody(fetchMock)).toEqual({ customNote: "敲门无人应答", expectedRecordId: "r1", expectedVersion: 3, status: "COVERED" });
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("敲门无人应答");
  });

  it("ignores a second save while the first request is pending", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    render(<RecordEditor backHref="/back" buildingId="b1" dormitories={[{ expectedRecordId: null, expectedVersion: null, id: "d1", roomNo: "101" }]} floor="1" mode="create" quickNotes={notes} title="记录 101" />);

    const saveButton = screen.getByRole("button", { name: "保存记录" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRequest(new Response("{}", { status: 200 }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
  });

  it("posts all selected dormitory concurrency targets in batch mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<RecordEditor backHref="/back" buildingId="b1" dormitories={[{ expectedRecordId: null, expectedVersion: null, id: "d1", roomNo: "101" }, { expectedRecordId: "r2", expectedVersion: 4, id: "d2", roomNo: "102" }]} floor="1" mode="batch" quickNotes={notes} title="标记 101、102" />);
    fireEvent.click(screen.getByRole("button", { name: "无备注" }));
    fireEvent.click(screen.getByRole("button", { name: "保存2间宿舍" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sweep-records/batch", expect.objectContaining({ method: "POST" })));
    expect(submittedBody(fetchMock)).toEqual({ buildingId: "b1", targets: [{ dormitoryId: "d1", expectedRecordId: null, expectedVersion: null }, { dormitoryId: "d2", expectedRecordId: "r2", expectedVersion: 4 }], customNote: null, status: "PENDING" });
  });
});
