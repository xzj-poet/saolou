import { describe, expect, it } from "vitest";

import {
  DormitoryRangeError,
  generateDormitoryRange,
} from "@/modules/campus/dormitory-range";

describe("generateDormitoryRange", () => {
  it("generates literal room numbers in stable numeric order", () => {
    expect(
      generateDormitoryRange({
        floorEnd: 3,
        floorStart: 2,
        roomEnd: 3,
        roomStart: 1,
      }),
    ).toEqual([
      { floor: "2", roomNo: "201", sortOrder: 201 },
      { floor: "2", roomNo: "202", sortOrder: 202 },
      { floor: "2", roomNo: "203", sortOrder: 203 },
      { floor: "3", roomNo: "301", sortOrder: 301 },
      { floor: "3", roomNo: "302", sortOrder: 302 },
      { floor: "3", roomNo: "303", sortOrder: 303 },
    ]);
  });

  it.each([
    ["reversed floors", { floorEnd: 2, floorStart: 3, roomEnd: 3, roomStart: 1 }],
    ["reversed rooms", { floorEnd: 2, floorStart: 2, roomEnd: 1, roomStart: 3 }],
    ["zero floor", { floorEnd: 2, floorStart: 0, roomEnd: 3, roomStart: 1 }],
    ["room above 99", { floorEnd: 2, floorStart: 2, roomEnd: 100, roomStart: 1 }],
    ["non-integer", { floorEnd: 2.5, floorStart: 2, roomEnd: 3, roomStart: 1 }],
  ])("rejects %s before generating anything", (_label, input) => {
    expect(() => generateDormitoryRange(input)).toThrow(DormitoryRangeError);
  });

  it("rejects a request that would generate more than 500 rooms", () => {
    expect(() =>
      generateDormitoryRange({
        floorEnd: 99,
        floorStart: 1,
        roomEnd: 99,
        roomStart: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "DORMITORY_RANGE_TOO_LARGE" }));
  });
});
