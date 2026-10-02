import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseEnv } from "./env";

describe("database environment", () => {
  it("reports a named configuration error without leaking values", () => {
    const secret = "do-not-print-this-secret";

    expect(() =>
      parseEnv({
        ADMIN_PASSWORD: secret,
        ADMIN_USERNAME: "admin",
      }),
    ).toThrowError(EnvironmentConfigurationError);

    try {
      parseEnv({ ADMIN_PASSWORD: secret, ADMIN_USERNAME: "admin" });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain("DATABASE_URL");
    }
  });
});
