import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/modules/auth/login-form";

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

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("账号"), {
    target: { value: "agent" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "password-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
}

describe("LoginForm", () => {
  it("contains only the approved login controls and copy", () => {
    render(<LoginForm />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "显示密码" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText(/注册|租户|团队|套餐|忘记密码/)).not.toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "隐藏密码" })).toBeInTheDocument();
  });

  it("disables duplicate submission while login is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<LoginForm />);

    fillAndSubmit();
    fireEvent.click(screen.getByRole("button", { name: "正在登录…" }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("账号")).toBeDisabled();
    expect(screen.getByLabelText("密码")).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在登录…" })).toBeDisabled();

    resolveRequest?.(
      new Response(
        JSON.stringify({
          user: { id: "1", name: "代理", role: "AGENT", username: "agent" },
        }),
        { status: 200 },
      ),
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app/schools"));
  });

  it.each([
    [401, "账号或密码错误"],
    [403, "账号已停用，请联系管理员"],
  ])("renders the server error for status %s", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "ERROR", message } }), {
          status,
        }),
      ),
    );
    render(<LoginForm />);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
