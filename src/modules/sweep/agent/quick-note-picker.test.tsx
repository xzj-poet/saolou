import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickNotePicker } from "@/modules/sweep/agent/quick-note-picker";

const notes = Array.from({ length: 6 }, (_, index) => ({
  content: `快捷备注 ${index + 1}`,
  id: `note-${index + 1}`,
}));

function renderPicker() {
  const actions = {
    onChooseCustom: vi.fn(),
    onChooseNone: vi.fn(),
    onChooseQuick: vi.fn(),
  };
  render(<QuickNotePicker
    noteMode="none"
    notes={notes}
    selectedId={null}
    {...actions}
  />);
  return actions;
}

describe("QuickNotePicker", () => {
  it("keeps options collapsed until the full-width trigger is opened", () => {
    renderPicker();

    const trigger = screen.getByRole("button", { name: /选择快捷备注（可选）/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "快捷备注选项" })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "快捷备注选项" })).toBeInTheDocument();
  });

  it("preserves note order, keeps custom last, and closes after a selection", () => {
    const actions = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /选择快捷备注（可选）/ }));
    const list = screen.getByRole("listbox", { name: "快捷备注选项" });

    expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "快捷备注 1",
      "快捷备注 2",
      "快捷备注 3",
      "快捷备注 4",
      "快捷备注 5",
      "快捷备注 6",
      "无备注",
      "自定义备注",
    ]);

    fireEvent.click(within(list).getByRole("option", { name: "快捷备注 2" }));
    expect(actions.onChooseQuick).toHaveBeenCalledWith("note-2");
    expect(screen.queryByRole("listbox", { name: "快捷备注选项" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /选择快捷备注（可选）/ }));
    fireEvent.click(screen.getByRole("option", { name: "无备注" }));
    expect(actions.onChooseNone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /选择快捷备注（可选）/ }));
    fireEvent.click(screen.getByRole("option", { name: "自定义备注" }));
    expect(actions.onChooseCustom).toHaveBeenCalledTimes(1);
  });
});
