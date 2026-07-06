import { describe, it, expect } from "vitest";
import { getImpostorCount, PLAYER_SPEED, TICK_RATE_HZ, TILE_SIZE } from "./constants.js";
import { GAME_EVENTS } from "./types.js";

describe("game constants", () => {
  it("has correct tick rate and tile size", () => {
    expect(TICK_RATE_HZ).toBe(20);
    expect(TILE_SIZE).toBe(32);
    expect(PLAYER_SPEED).toBe(3.0);
  });

  it("defines game event names", () => {
    expect(GAME_EVENTS.INPUT).toBe("game:input");
    expect(GAME_EVENTS.STARTED).toBe("game:started");
    expect(GAME_EVENTS.TICK).toBe("game:tick");
    expect(GAME_EVENTS.ENDED).toBe("game:ended");
  });
});

describe("getImpostorCount", () => {
  it("returns 1 for 4-5 players", () => {
    expect(getImpostorCount(4)).toBe(1);
    expect(getImpostorCount(5)).toBe(1);
  });

  it("returns 2 for 6-7 players", () => {
    expect(getImpostorCount(6)).toBe(2);
    expect(getImpostorCount(7)).toBe(2);
  });

  it("returns 2-3 for 8-10 players", () => {
    expect(getImpostorCount(8)).toBe(2);
    expect(getImpostorCount(9)).toBe(3);
    expect(getImpostorCount(10)).toBe(3);
  });

  it("never returns more than 3", () => {
    expect(getImpostorCount(10)).toBeLessThanOrEqual(3);
  });
});
