import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  rateLimitBucketCountForTests,
  resetRateLimitsForTests,
  sourceAddress,
} from "@/lib/http/rate-limit";

const policy = { limit: 2, windowMs: 1_000 };

describe("fixed-window rate limiting", () => {
  beforeEach(resetRateLimitsForTests);

  it("allows the exact boundary and returns an integer retry delay afterward", () => {
    expect(consumeRateLimit("user:a", policy, 100).allowed).toBe(true);
    expect(consumeRateLimit("user:a", policy, 200).allowed).toBe(true);
    const denied = consumeRateLimit("user:a", policy, 250);
    expect(denied).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    expect(Number.isInteger(denied.retryAfterSeconds)).toBe(true);
  });

  it("starts a fresh bucket when the window boundary is reached", () => {
    consumeRateLimit("user:a", policy, 0);
    consumeRateLimit("user:a", policy, 1);
    expect(consumeRateLimit("user:a", policy, 999).allowed).toBe(false);
    expect(consumeRateLimit("user:a", policy, 1_000).allowed).toBe(true);
  });

  it("keeps keys independent and lazily removes stale buckets", () => {
    consumeRateLimit("user:a", policy, 0);
    consumeRateLimit("user:b", policy, 0);
    expect(rateLimitBucketCountForTests()).toBe(2);
    expect(consumeRateLimit("user:c", policy, 2_000).allowed).toBe(true);
    expect(rateLimitBucketCountForTests()).toBe(1);
  });

  it("uses the final forwarding address so a forged prefix cannot choose the bucket", () => {
    const request = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.9, 10.0.0.4" },
    });
    expect(sourceAddress(request)).toBe("10.0.0.4");
  });
});
