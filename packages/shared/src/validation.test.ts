import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "./validation.js";

describe("registerSchema", () => {
  const validInput = { username: "alice", password: "secret123" };

  it("accepts valid input", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 3 chars", () => {
    const result = registerSchema.safeParse({ username: "ab", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 20 chars", () => {
    const result = registerSchema.safeParse({ username: "a".repeat(21), password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects username with special chars", () => {
    const result = registerSchema.safeParse({ username: "alice!", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 6 chars", () => {
    const result = registerSchema.safeParse({ username: "alice", password: "12345" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from username", () => {
    const result = registerSchema.safeParse({ username: "  alice  ", password: "secret123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("alice");
    }
  });
});

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({ username: "alice", password: "secret123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty username", () => {
    const result = loginSchema.safeParse({ username: "", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ username: "alice", password: "" });
    expect(result.success).toBe(false);
  });
});
