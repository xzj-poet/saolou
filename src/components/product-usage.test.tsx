import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductUsage } from "@/components/product-usage";

describe("ProductUsage", () => {
  it("opens a concise guide with status and operating instructions", () => {
    render(<ProductUsage />);

    fireEvent.click(screen.getByRole("button", { name: "使用说明" }));

    expect(screen.getByRole("dialog", { name: "使用说明" })).toBeInTheDocument();
    expect(screen.getByText(/记录和查看扫楼数据，提高扫楼效率。/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "宿舍状态说明" })).toBeInTheDocument();
    expect(screen.getByText("未扫：尚未记录本次扫楼情况。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "操作细则" })).toBeInTheDocument();
    expect(screen.getByText("已经完成大部分注册并且已经留下种子联络人，选择“已覆盖”；没有完成大部分注册或者没有留下种子联络人，选择“待补扫”。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭使用说明" }));
    expect(screen.queryByRole("dialog", { name: "使用说明" })).not.toBeInTheDocument();
  });
});
