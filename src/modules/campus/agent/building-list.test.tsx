import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BuildingList } from "@/modules/campus/agent/building-list";
import { DormitoryDirectory } from "@/modules/campus/agent/dormitory-directory";

describe("BuildingList", () => {
  it("renders a separate building-selection page with exact derived counts", () => {
    render(<BuildingList page={{
      buildings: [{ counts: { covered: 1, pending: 0, unvisited: 1 }, dormitoryCount: 2, floorCount: 1, id: "building-3", name: "3号楼", note: "备注99层", sortOrder: 1 }],
      school: { id: "school-1", name: "苏州大学本部" },
    }} />);

    expect(screen.getByRole("heading", { name: "选择楼栋" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3号楼.*1层.*2间宿舍/ })).toHaveAttribute("href", "/app/buildings/building-3");
    expect(screen.getByRole("link", { name: "返回学校选择" })).toHaveClass("mobile-back-button");
    expect(screen.getByText("1 已覆盖")).toBeInTheDocument();
    expect(screen.getByText("0 待补扫")).toBeInTheDocument();
    expect(screen.getByText("1 未扫")).toBeInTheDocument();
  });

  it("renders a neutral floor-grouped dormitory directory without record actions", () => {
    render(<DormitoryDirectory directory={{
      building: { id: "building-3", name: "3号楼", note: null },
      floors: [{ floor: "2", dormitories: [{ id: "dorm-201", roomNo: "201", sortOrder: 201 }, { id: "dorm-202", roomNo: "202", sortOrder: 202 }] }],
      school: { id: "school-1", name: "苏州大学本部" },
    }} />);
    const floor = screen.getByRole("region", { name: "2楼宿舍" });
    expect(within(floor).getByText("201")).toBeInTheDocument();
    expect(within(floor).getByText("202")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回楼栋选择" })).toHaveClass("mobile-back-button");
    expect(screen.queryByRole("button", { name: /记录|标记|编辑/ })).not.toBeInTheDocument();
  });
});
