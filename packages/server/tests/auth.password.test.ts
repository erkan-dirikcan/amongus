import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("hashPassword", () => {
  it("returns a bcrypt hash that differs from plaintext", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).not.toBe("mypassword");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
  });

  it("produces different hashes for same input (salt)", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correctpass");
    const isValid = await verifyPassword("correctpass", hash);
    expect(isValid).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correctpass");
    const isValid = await verifyPassword("wrongpass", hash);
    expect(isValid).toBe(false);
  });

  it("returns false for malformed hash", async () => {
    const isValid = await verifyPassword("anypass", "not-a-real-hash");
    expect(isValid).toBe(false);
  });
});
