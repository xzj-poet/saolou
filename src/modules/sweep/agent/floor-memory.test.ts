import { describe, expect, it } from "vitest";

import { floorMemoryCookieName, readRememberedBuildingFloor, rememberBuildingFloor, resolveBuildingFloor } from "@/modules/sweep/agent/floor-memory";

describe("floor memory", () => {
  it("uses the requested floor first, then the remembered floor, then the lowest available floor", () => {
    const floors = ["6", "3", "1", "2"];

    expect(resolveBuildingFloor(floors, "2", "3")).toBe("2");
    expect(resolveBuildingFloor(floors, undefined, "3")).toBe("3");
    expect(resolveBuildingFloor(floors, undefined, "9")).toBe("1");
  });

  it("isolates remembered floors by both user and building", () => {
    expect(floorMemoryCookieName("agent-1", "building-a")).not.toBe(floorMemoryCookieName("agent-2", "building-a"));
    expect(floorMemoryCookieName("agent-1", "building-a")).not.toBe(floorMemoryCookieName("agent-1", "building-b"));
  });

  it("keeps the remembered floor in the current browser as a fallback", () => {
    rememberBuildingFloor("sweep-floor-test", "3");

    expect(readRememberedBuildingFloor("sweep-floor-test")).toBe("3");
  });
});
