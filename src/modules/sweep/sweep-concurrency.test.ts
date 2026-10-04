import { describe, expect, it } from "vitest";

import {
  detectRecordConflict,
  recordConflictError,
  recordLockKey,
  sortRecordTargets,
} from "@/modules/sweep/sweep-concurrency";

describe("sweep concurrency primitives", () => {
  it("detects created updated deleted and ABA conflicts", () => {
    expect(
      detectRecordConflict(
        { id: "record-new", version: 1 },
        { expectedRecordId: "record-old", expectedVersion: 1 },
      ),
    ).toBe("UPDATED");
    expect(
      detectRecordConflict(
        { id: "record-1", version: 2 },
        { expectedRecordId: "record-1", expectedVersion: 1 },
      ),
    ).toBe("UPDATED");
    expect(
      detectRecordConflict(
        { id: "record-1", version: 1 },
        { expectedRecordId: null, expectedVersion: null },
      ),
    ).toBe("CREATED");
    expect(
      detectRecordConflict(null, {
        expectedRecordId: "record-1",
        expectedVersion: 1,
      }),
    ).toBe("DELETED");
    expect(
      detectRecordConflict(
        { id: "record-1", version: 1 },
        { expectedRecordId: "record-1", expectedVersion: 1 },
      ),
    ).toBeNull();
  });

  it("sorts targets by dormitory id without mutating input", () => {
    const input = [{ dormitoryId: "b" }, { dormitoryId: "a" }];

    expect(sortRecordTargets(input).map((target) => target.dormitoryId)).toEqual([
      "a",
      "b",
    ]);
    expect(input.map((target) => target.dormitoryId)).toEqual(["b", "a"]);
  });

  it("uses one compound lock key", () => {
    expect(recordLockKey("agent", "dorm")).toBe("agent:dorm");
  });

  it("returns structured conflicts in the public error envelope", () => {
    const conflicts = [
      {
        dormitoryId: "dorm-1",
        reason: "DELETED" as const,
        roomNo: "101",
      },
    ];

    expect(recordConflictError(conflicts)).toMatchObject({
      code: "RECORD_CONFLICT",
      fields: { conflicts },
      status: 409,
    });
  });
});
