import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page";

describe("root page", () => {
  it("offers the shared login entry", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "校园扫楼记录系统" }),
    ).toBeInTheDocument();
    expect(screen.getByText("自研扫楼系统 内部使用")).toBeInTheDocument();
    expect(screen.getByText("记录扫楼数据，提高扫楼效率！")).toBeInTheDocument();
    expect(screen.queryByText("门")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入系统" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
