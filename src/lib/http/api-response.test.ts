import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http/api-error";
import { apiErrorResponse } from "@/lib/http/api-response";
import { setRequestActor } from "@/lib/http/request-context";

afterEach(() => vi.restoreAllMocks());

function logged(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
}

describe("apiErrorResponse", () => {
  it("returns request/error headers and writes a redacted info conflict log", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/records?token=SECRET_TOKEN", { method: "PUT", headers: { "x-request-id": "request-123" } });
    setRequestActor(request, "agent-7");
    const response = apiErrorResponse(new ApiError(409, "RECORD_CONFLICT", "SECRET_PASSWORD", { note: "SECRET_NOTE" }, { "Retry-After": "3" }), request);
    expect(response.status).toBe(409);
    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(response.headers.get("retry-after")).toBe("3");
    expect(logged(info)).toMatchObject({ actorId: "agent-7", code: "RECORD_CONFLICT", level: "info", method: "PUT", path: "/api/records", requestId: "request-123", status: 409 });
    expect(String(info.mock.calls[0]?.[0])).not.toMatch(/SECRET_PASSWORD|SECRET_TOKEN|SECRET_NOTE/);
  });

  it("logs forbidden and limited requests at warn and unknown failures at error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const forbidden = new Request("http://localhost/api/admin", { method: "POST" });
    apiErrorResponse(new ApiError(403, "FORBIDDEN", "no"), forbidden);
    apiErrorResponse(new ApiError(429, "RATE_LIMITED", "slow"), new Request("http://localhost/api/login", { method: "POST" }));
    apiErrorResponse(new Error("SECRET_STACK_VALUE"), new Request("http://localhost/api/fail"));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(logged(warn)).toMatchObject({ level: "warn", status: 403 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(logged(error)).toMatchObject({ code: "INTERNAL_ERROR", level: "error", status: 500 });
    expect(String(error.mock.calls[0]?.[0])).not.toContain("SECRET_STACK_VALUE");
  });
});
