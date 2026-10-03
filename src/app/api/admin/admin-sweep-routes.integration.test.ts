import { describe, expect, it } from "vitest";

import { GET as getAudits } from "@/app/api/admin/sweep-audits/route";
import { GET as getRecords } from "@/app/api/admin/sweep-records/route";
import { DELETE, PUT } from "@/app/api/admin/sweep-records/[recordId]/route";

const recordId = "00000000-0000-0000-0000-000000000000";
const context = { params: Promise.resolve({ recordId }) };

describe("administrator sweep routes", () => {
  it.each([
    ["records", (request: Request) => getRecords(request), "GET", "/api/admin/sweep-records"],
    ["audits", (request: Request) => getAudits(request), "GET", "/api/admin/sweep-audits"],
    ["update", (request: Request) => PUT(request, context), "PUT", `/api/admin/sweep-records/${recordId}`],
    ["delete", (request: Request) => DELETE(request, context), "DELETE", `/api/admin/sweep-records/${recordId}`],
  ])("requires an administrator for %s", async (_name, handler, method, path) => {
    const response = await handler(new Request(`http://localhost${path}`, { body: method === "PUT" ? "{}" : undefined, headers: { origin: "http://localhost" }, method }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
