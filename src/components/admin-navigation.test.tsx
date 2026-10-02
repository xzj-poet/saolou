import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "@/components/admin-navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/campus" }));

describe("AdminNavigation", () => {
  it("provides real destinations and marks the current section", () => {
    render(<AdminNavigation />);

    expect(screen.getByRole("link", { name: "基础数据" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "代理账号" })).toHaveAttribute(
      "href",
      "/admin/agents",
    );
    expect(screen.getByRole("link", { name: "快捷备注" })).toHaveAttribute(
      "href",
      "/admin/quick-notes",
    );
    expect(screen.getByRole("link", { name: "扫楼数据" })).toHaveAttribute(
      "href",
      "/admin/sweep-data",
    );
  });
});
