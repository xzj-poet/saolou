import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("every mutating API route enforces same-origin and every API catch includes request context", async () => {
  const apiRoot = new URL("src/app/api/", root);
  const entries = await readdir(apiRoot, { recursive: true, withFileTypes: true });
  const routes = entries.filter((entry) => entry.isFile() && entry.name === "route.ts");
  for (const entry of routes) {
    const file = path.join(entry.parentPath, entry.name);
    const source = await readFile(file, "utf8");
    if (/export async function (?:POST|PUT|PATCH|DELETE)\b/.test(source)) {
      assert.match(source, /requireSameOrigin\(request\)/, file);
    }
    if (/catch\s*\(error\)/.test(source)) {
      assert.match(source, /apiErrorResponse\(error, request\)/, file);
    }
  }
});

test("Next and Caddy define the pragmatic security headers", async () => {
  const [nextConfig, caddy] = await Promise.all([read("next.config.ts"), read("Caddyfile")]);
  for (const value of ["X-Content-Type-Options", "nosniff", "X-Frame-Options", "DENY", "Referrer-Policy", "same-origin", "Permissions-Policy"]) assert.match(nextConfig, new RegExp(value));
  assert.match(caddy, /Strict-Transport-Security/);
});
