import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/login-form", () => ({
  LoginForm: () => <form aria-label="登录表单" />,
}));

import LoginPage from "./page";

describe("login page", () => {
  it("uses the concise internal-use copy without the door mark", () => {
    render(<LoginPage />);

    expect(screen.getByText("自研扫楼系统 内部使用")).toBeInTheDocument();
    expect(screen.getByText("记录扫楼数据，提高扫楼效率！")).toBeInTheDocument();
    expect(screen.queryByText("门")).not.toBeInTheDocument();
  });
});
