import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page";

describe("root page", () => {
  it("offers the shared login entry", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "校园扫楼记录系统" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入系统" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
