import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin-navigation", () => ({
  AdminNavigation: () => <nav aria-label="管理员导航" />,
}));
vi.mock("@/components/identity-menu", () => ({
  IdentityMenu: () => <div aria-label="当前账号" />,
}));

import { AdminShell } from "@/components/admin-shell";
import { AppShell } from "@/components/app-shell";

const user = { id: "u1", mustChangePassword: false, name: "代理1", role: "AGENT" as const, username: "agent-1" };
describe("shared shells", () => {
  it("shows the same guide entry instead of the old slogans", () => {
    const { rerender } = render(<AppShell user={user}><p>代理页面</p></AppShell>);
    expect(screen.getByRole("button", { name: "使用说明" })).toBeInTheDocument();
    expect(screen.queryByText("下一扇门")).not.toBeInTheDocument();

    rerender(<AdminShell user={{ ...user, role: "ADMIN" }}><p>管理页面</p></AdminShell>);
    expect(screen.getByRole("button", { name: "使用说明" })).toBeInTheDocument();
    expect(screen.queryByText("管理员后台")).not.toBeInTheDocument();
  });
});
