import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/modules/auth/password";

describe("password hashing", () => {
  it("uses a fresh salt for every hash and never embeds plaintext", async () => {
    const password = "correct horse battery staple";

    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(second).not.toContain(password);
  });

  it("accepts the right password and rejects wrong or malformed hashes", async () => {
    const encodedHash = await hashPassword("secure-password-123");

    await expect(verifyPassword("secure-password-123", encodedHash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("wrong-password", encodedHash)).resolves.toBe(false);
    await expect(verifyPassword("secure-password-123", "not-a-hash")).resolves.toBe(
      false,
    );
  });

  it("enforces the service password length boundary", async () => {
    await expect(hashPassword("abcdef")).resolves.toMatch(/^scrypt\$/);
    await expect(hashPassword("short")).rejects.toThrow(/6.*128/);
    await expect(hashPassword("x".repeat(129))).rejects.toThrow(/6.*128/);
  });
});
