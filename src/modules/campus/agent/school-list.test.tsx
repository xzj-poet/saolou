import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SchoolList } from "@/modules/campus/agent/school-list";

describe("SchoolList", () => {
  it("makes the full authorized row a link and leaves unauthorized schools visible but disabled", () => {
    render(<SchoolList schools={[
      { id: "school-1", isAuthorized: true, name: "苏州大学本部", sortOrder: 1 },
      { id: "school-2", isAuthorized: false, name: "苏州大学北区", sortOrder: 2 },
    ]} />);

    expect(screen.getByRole("link", { name: /苏州大学本部.*已授权/ })).toHaveAttribute(
      "href",
      "/app/schools/school-1/buildings",
    );
    expect(screen.getByText("苏州大学北区").closest("div")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("未授权")).toBeInTheDocument();
  });
});
