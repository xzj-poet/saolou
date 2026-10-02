import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampusManager } from "@/modules/campus/admin/campus-manager";
import type { AdminSchoolSummary } from "@/modules/campus/campus-types";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

const schools: AdminSchoolSummary[] = [
  {
    buildingCount: 1,
    buildings: [
      {
        dormitories: [
          {
            floor: "2",
            id: "dormitory-201",
            isActive: true,
            isProtected: true,
            roomNo: "201",
            sortOrder: 201,
          },
          {
            floor: "2",
            id: "dormitory-202",
            isActive: true,
            isProtected: false,
            roomNo: "202",
            sortOrder: 202,
          },
        ],
        dormitoryCount: 2,
        floorCount: 1,
        id: "building-3",
        isActive: true,
        name: "3号楼",
        note: "靠近东门，备注写着99层 999间",
        schoolId: "school-main",
        sortOrder: 1,
      },
    ],
    dormitoryCount: 2,
    id: "school-main",
    isActive: true,
    name: "苏州大学本部",
    sortOrder: 1,
  },
];

describe("CampusManager", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    navigation.replace.mockReset();
  });

  it("uses an accordion only for schools and renders derived building counts", () => {
    render(<CampusManager initialSchoolId="school-main" schools={schools} />);

    expect(screen.getByRole("button", { name: /收起苏州大学本部/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("1层 · 2间宿舍")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开3号楼/ })).not.toBeInTheDocument();
  });

  it("opens the blueprint from the building body without opening it from the menu button", () => {
    render(<CampusManager initialSchoolId="school-main" schools={schools} />);

    fireEvent.click(screen.getByRole("button", { name: "3号楼操作" }));
    expect(screen.queryByRole("dialog", { name: "3号楼宿舍蓝图" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "编辑楼栋名称" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "编辑楼栋备注" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "宿舍管理" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除/停用楼栋" })).toHaveClass(
      "danger-action",
    );

    fireEvent.click(screen.getByRole("button", { name: "查看3号楼宿舍蓝图" }));
    const dialog = screen.getByRole("dialog", { name: "3号楼宿舍蓝图" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "2楼" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /2楼/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("201")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("201 有扫楼记录，受保护")).toBeInTheDocument();
  });

  it("exposes the approved school actions and the three dormitory-management tabs", () => {
    render(<CampusManager initialSchoolId="school-main" schools={schools} />);

    fireEvent.click(screen.getByRole("button", { name: "苏州大学本部操作" }));
    expect(screen.getByRole("menuitem", { name: "编辑学校名称" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "新建楼栋" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除/停用学校" })).toHaveClass(
      "danger-action",
    );

    fireEvent.click(screen.getByRole("button", { name: "3号楼操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "宿舍管理" }));
    const dialog = screen.getByRole("dialog", { name: "3号楼宿舍管理" });
    expect(within(dialog).getByRole("tab", { name: "单个添加" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "批量添加" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "删除停用" })).toBeInTheDocument();
  });
});
