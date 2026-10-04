import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdentityMenu } from "@/components/identity-menu";
import { UnsavedChangesProvider, useUnsavedChanges } from "@/components/unsaved-changes-provider";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  vi.restoreAllMocks();
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
});

describe("IdentityMenu", () => {
  it.each([
    ["ADMIN", "管理员"],
    ["AGENT", "代理"],
  ] as const)("shows the current %s identity and only logout", (role, roleLabel) => {
    render(
      <IdentityMenu
        user={{ id: "user-1", name: "张三", role, username: "zhangsan" }}
      />,
    );

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText(roleLabel)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(screen.queryByText(/修改密码|个人设置|切换团队/)).not.toBeInTheDocument();
  });

  it("logs out and returns to the shared login page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    render(
      <IdentityMenu
        user={{ id: "user-1", name: "张三", role: "AGENT", username: "zhangsan" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
      expect(navigation.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("confirms before logout when a protected editor is dirty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    function DirtyEditor() {
      useUnsavedChanges(true);
      return <IdentityMenu user={{ id: "user-1", name: "张三", role: "AGENT", username: "zhangsan" }} />;
    }

    render(<UnsavedChangesProvider><DirtyEditor /></UnsavedChangesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }));
  });
});
