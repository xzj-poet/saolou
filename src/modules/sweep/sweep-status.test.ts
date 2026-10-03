import { describe, expect, it } from "vitest";

import { deriveOverallStatus } from "@/modules/sweep/sweep-status";

describe("deriveOverallStatus", () => {
  it("returns UNVISITED when no current records exist", () => {
    expect(deriveOverallStatus([])).toBe("UNVISITED");
  });

  it("returns PENDING when every current record still needs a follow-up", () => {
    expect(deriveOverallStatus(["PENDING", "PENDING"])).toBe("PENDING");
  });

  it("returns COVERED whenever any current record is covered regardless of order", () => {
    expect(deriveOverallStatus(["PENDING", "COVERED"])).toBe("COVERED");
    expect(deriveOverallStatus(["COVERED", "PENDING"])).toBe("COVERED");
  });
});
