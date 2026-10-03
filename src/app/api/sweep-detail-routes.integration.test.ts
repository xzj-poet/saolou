import { describe, expect, it } from "vitest";

import { GET as getDetail } from "@/app/api/dormitories/[dormitoryId]/route";
import { GET as getHistory } from "@/app/api/dormitories/[dormitoryId]/history/route";

const dormitoryId = "00000000-0000-0000-0000-000000000000";
const context = { params: Promise.resolve({ dormitoryId }) };

describe("dormitory read routes", () => {
  it.each([
    ["detail", getDetail, `/api/dormitories/${dormitoryId}`],
    ["history", getHistory, `/api/dormitories/${dormitoryId}/history`],
  ])("requires an authenticated agent for %s", async (_name, handler, path) => {
    const response = await handler(new Request(`http://localhost${path}`), context);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
