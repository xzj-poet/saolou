import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordForm } from "@/modules/auth/change-password-form";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
  vi.restoreAllMocks();
});

function fillPasswords(newPassword: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: confirmPassword } });
}

describe("ChangePasswordForm", () => {
  it("submits matching replacement passwords and opens the agent workspace", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<ChangePasswordForm />);

    fillPasswords("abcdef", "abcdef");
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({
        body: JSON.stringify({ confirmPassword: "abcdef", newPassword: "abcdef" }),
        method: "POST",
      }),
    ));
    expect(navigation.replace).toHaveBeenCalledWith("/app/schools");
  });

  it("shows the API validation error and allows logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "两次输入的密码不一致" } }), { status: 400 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    render(<ChangePasswordForm />);

    fillPasswords("abcdef", "ghijkl");
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致");

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/auth/logout", { method: "POST" }));
    expect(navigation.replace).toHaveBeenCalledWith("/login");
  });
});
