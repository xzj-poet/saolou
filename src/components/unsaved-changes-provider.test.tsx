import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "@/components/unsaved-changes-provider";

function Harness({ action }: { action: () => void }) {
  const [dirty, setDirty] = useState(false);
  const confirmNavigation = useUnsavedChanges(dirty);
  return <>
    <button onClick={() => setDirty(true)} type="button">编辑</button>
    <button onClick={() => confirmNavigation(action)} type="button">离开</button>
  </>;
}

describe("UnsavedChangesProvider", () => {
  it("blocks internal navigation when the user keeps an unsaved draft", () => {
    const action = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<UnsavedChangesProvider><Harness action={action} /></UnsavedChangesProvider>);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "离开" }));

    expect(window.confirm).toHaveBeenCalledWith("当前修改尚未保存，确定要离开吗？");
    expect(action).not.toHaveBeenCalled();
  });

  it("runs navigation after confirmation and warns on browser unload", () => {
    const action = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<UnsavedChangesProvider><Harness action={action} /></UnsavedChangesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    fireEvent.click(screen.getByRole("button", { name: "离开" }));

    expect(event.defaultPrevented).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });
});
