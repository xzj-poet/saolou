import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { generateTemporaryPassword } from "@/modules/agents/temporary-password";

describe("generateTemporaryPassword", () => {
  it("returns distinct 16-character passwords with every required character group", async () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();

    expect(first).toHaveLength(16);
    expect(second).toHaveLength(16);
    expect(first).not.toBe(second);
    for (const password of [first, second]) {
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).toMatch(/[!@#$%&*]/);
      expect(password).not.toMatch(/[01IlOo]/);
      await expect(verifyPassword(password, await hashPassword(password))).resolves.toBe(true);
    }
  });
});
