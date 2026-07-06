import { describe, it, expect, beforeAll } from "vitest";
import { signToken, verifyToken, type JwtPayload } from "../src/auth/jwt.js";

// Set env vars before importing config
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-jwt-tests-min-32-chars-long!!";
  process.env.JWT_EXPIRES_IN = "1h";
});

describe("signToken and verifyToken", () => {
  const payload: JwtPayload = { userId: "user-123", username: "alice" };

  it("signs and verifies a valid token", () => {
    const token = signToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user-123");
    expect(decoded?.username).toBe("alice");
  });

  it("returns null for invalid token string", () => {
    const decoded = verifyToken("not.a.valid.token");
    expect(decoded).toBeNull();
  });

  it("returns null for token signed with different secret", () => {
    const token = signToken(payload);
    // Tamper: flip last char
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const decoded = verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  it("includes issued-at and expiry claims", () => {
    const token = signToken(payload);
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(decodedPayload.iat).toBeDefined();
    expect(decodedPayload.exp).toBeDefined();
  });
});
