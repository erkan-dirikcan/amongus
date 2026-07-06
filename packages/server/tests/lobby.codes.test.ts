import { describe, it, expect } from "vitest";
import { generateLobbyCode } from "../src/lobby/codes.js";
import { LOBBY_CODE_CHARS, LOBBY_CODE_LENGTH } from "@amongus/shared";

describe("generateLobbyCode", () => {
  it("returns a string of the correct length", () => {
    const code = generateLobbyCode();
    expect(code.length).toBe(LOBBY_CODE_LENGTH);
  });

  it("only uses allowed characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLobbyCode();
      for (const char of code) {
        expect(LOBBY_CODE_CHARS).toContain(char);
      }
    }
  });

  it("produces different codes across many calls (randomness)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateLobbyCode());
    }
    // With 32^6 ≈ 1B space, 100 codes should be near-unique
    expect(codes.size).toBeGreaterThan(95);
  });
});
