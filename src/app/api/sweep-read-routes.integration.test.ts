import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/buildings/[buildingId]/matrix/route";

describe("building matrix route", () => {
  it("requires an authenticated agent", async () => {
    const response = await GET(new Request("http://localhost/api/buildings/00000000-0000-0000-0000-000000000000/matrix"), { params: Promise.resolve({ buildingId: "00000000-0000-0000-0000-000000000000" }) });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
