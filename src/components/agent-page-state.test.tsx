import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentPageError, AgentPageLoading } from "@/components/agent-page-state";

describe("agent page states", () => {
  it("shows a meaningful loading state without stale data", () => {
    render(<AgentPageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载最新数据");
    expect(screen.getByText("请稍候，页面会在数据准备好后自动更新。")).toBeInTheDocument();
  });

  it("keeps a recoverable error in the page shell and retries fresh data", () => {
    const retry = vi.fn();
    render(<AgentPageError retry={retry} />);

    expect(screen.getByRole("heading", { name: "暂时无法加载此页面" })).toBeInTheDocument();
    expect(screen.getByText("当前页面位置已经保留，请重新加载最新数据。")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "重新加载" });
    expect(button).toHaveClass("primary-button", "full-button");
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
