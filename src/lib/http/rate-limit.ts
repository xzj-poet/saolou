import { ApiError } from "@/lib/http/api-error";

type Policy = { limit: number; windowMs: number };
type Bucket = { count: number; expiresAt: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(key: string, policy: Policy, now = Date.now()): RateLimitResult {
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(bucketKey);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, expiresAt: now + policy.windowMs };
    buckets.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1_000));
  if (bucket.count >= policy.limit) return { allowed: false, remaining: 0, retryAfterSeconds };
  bucket.count += 1;
  return { allowed: true, remaining: policy.limit - bucket.count, retryAfterSeconds };
}

export function requireRateLimit(key: string, policy: Policy) {
  const result = consumeRateLimit(key, policy);
  if (!result.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "操作过于频繁，请稍后重试", undefined, {
      "Retry-After": String(result.retryAfterSeconds),
    });
  }
}

export function sourceAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export function resetRateLimitsForTests() { buckets.clear(); }
export function rateLimitBucketCountForTests() { return buckets.size; }
