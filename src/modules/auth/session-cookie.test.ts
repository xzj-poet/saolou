import { describe, expect, it } from "vitest";

import { buildSessionCookie } from "@/modules/auth/session-cookie";

describe("session cookie", () => {
  it("uses production-safe flags and the session expiry", () => {
    const expiresAt = new Date("2030-01-02T03:04:05.000Z");

    expect(buildSessionCookie("raw-token", expiresAt, true)).toEqual({
      expires: expiresAt,
      httpOnly: true,
      name: "campus_sweep_session",
      path: "/",
      sameSite: "lax",
      secure: true,
      value: "raw-token",
    });
  });

  it("allows HTTP cookies only outside production", () => {
    expect(
      buildSessionCookie("raw-token", new Date("2030-01-02T03:04:05.000Z"), false)
        .secure,
    ).toBe(false);
  });
});
