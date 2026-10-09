import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

  it("keeps every admin destination available as a horizontally scrollable navigation strip on phones", async () => {
    const styles = await readFile(resolve(process.cwd(), "src", "app", "globals.css"), "utf8");
    const phoneStyles = styles.slice(styles.indexOf("@media (max-width: 480px)"));

    expect(phoneStyles).toMatch(/\.admin-nav\s*\{[\s\S]*display:\s*flex/);
    expect(phoneStyles).toMatch(/\.admin-nav\s*\{[\s\S]*flex-direction:\s*row/);
    expect(phoneStyles).toMatch(/\.admin-nav\s*\{[\s\S]*overflow-x:\s*auto/);
    expect(phoneStyles).not.toMatch(/\.admin-nav\s*\{[\s\S]*display:\s*none/);
  });
});
