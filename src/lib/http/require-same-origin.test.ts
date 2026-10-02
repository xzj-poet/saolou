import { describe, expect, it } from "vitest";

import { requireSameOrigin } from "@/lib/http/require-same-origin";

describe("same-origin protection", () => {
  it("accepts an origin matching the request URL", () => {
    const request = new Request("https://sweep.example.com/api/auth/login", {
      headers: { Origin: "https://sweep.example.com" },
      method: "POST",
    });

    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it.each(["https://evil.example.com", "not a url", ""])(
    "rejects an invalid origin: %s",
    (origin) => {
      const request = new Request("https://sweep.example.com/api/auth/login", {
        headers: origin ? { Origin: origin } : undefined,
        method: "POST",
      });

      try {
        requireSameOrigin(request);
        throw new Error("Expected origin validation to fail.");
      } catch (error) {
        expect(error).toMatchObject({
          code: "ORIGIN_MISMATCH",
          status: 403,
        });
      }
    },
  );
});
