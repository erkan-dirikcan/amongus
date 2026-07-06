import { describe, it, expect } from "vitest";
import {
  LOBBY_COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  LOBBY_CODE_CHARS,
  LOBBY_CODE_LENGTH,
  LOBBY_EVENTS,
} from "./constants.js";
import { lobbyCreateSchema, lobbyJoinSchema, lobbySetColorSchema } from "./validation.js";

describe("lobby constants", () => {
  it("has exactly 12 colors", () => {
    expect(LOBBY_COLORS.length).toBe(12);
  });

  it("has max players 10 and min players 4", () => {
    expect(MAX_PLAYERS).toBe(10);
    expect(MIN_PLAYERS).toBe(4);
  });

  it("excludes ambiguous chars 0, 1, O, I from code chars", () => {
    expect(LOBBY_CODE_CHARS).not.toContain("0");
    expect(LOBBY_CODE_CHARS).not.toContain("1");
    expect(LOBBY_CODE_CHARS).not.toContain("O");
    expect(LOBBY_CODE_CHARS).not.toContain("I");
    expect(LOBBY_CODE_LENGTH).toBe(6);
  });

  it("defines all lobby event names", () => {
    expect(LOBBY_EVENTS.CREATE).toBe("lobby:create");
    expect(LOBBY_EVENTS.JOIN).toBe("lobby:join");
    expect(LOBBY_EVENTS.STATE).toBe("lobby:state");
    expect(LOBBY_EVENTS.STARTED).toBe("lobby:started");
  });
});

describe("lobbyCreateSchema", () => {
  it("accepts empty object (no password)", () => {
    expect(lobbyCreateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts optional password", () => {
    expect(lobbyCreateSchema.safeParse({ password: "secret" }).success).toBe(true);
  });

  it("rejects empty password string", () => {
    expect(lobbyCreateSchema.safeParse({ password: "" }).success).toBe(false);
  });
});

describe("lobbyJoinSchema", () => {
  it("accepts valid 6-char code", () => {
    const r = lobbyJoinSchema.safeParse({ code: "ABC234" });
    expect(r.success).toBe(true);
  });

  it("uppercases the code", () => {
    const r = lobbyJoinSchema.safeParse({ code: "abc234" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe("ABC234");
  });

  it("rejects code with wrong length", () => {
    expect(lobbyJoinSchema.safeParse({ code: "ABC" }).success).toBe(false);
    expect(lobbyJoinSchema.safeParse({ code: "ABCDEFGH" }).success).toBe(false);
  });
});

describe("lobbySetColorSchema", () => {
  it("accepts a color string", () => {
    expect(lobbySetColorSchema.safeParse({ color: "red" }).success).toBe(true);
  });

  it("rejects missing color", () => {
    expect(lobbySetColorSchema.safeParse({}).success).toBe(false);
  });
});
