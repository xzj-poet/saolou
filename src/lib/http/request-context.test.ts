import { describe, expect, it } from "vitest";

import { requestActor, requestId, setRequestActor } from "@/lib/http/request-context";

describe("request context", () => {
  it("preserves a valid inbound request id and associates an actor", () => {
    const request = new Request("http://localhost/api/test", { headers: { "x-request-id": "edge-req_123.abc" } });
    setRequestActor(request, "user-42");
    expect(requestId(request)).toBe("edge-req_123.abc");
    expect(requestActor(request)).toBe("user-42");
  });

  it.each(["contains spaces", "x".repeat(129), "invalid-é"])("replaces invalid inbound id %j", (value) => {
    const request = new Request("http://localhost/api/test", { headers: { "x-request-id": value } });
    const generated = requestId(request);
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId(request)).toBe(generated);
  });
});
