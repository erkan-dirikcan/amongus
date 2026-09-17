import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { PLAYER_SPEED, TICK_INTERVAL_MS, DIAGONAL_FACTOR } from "@amongus/shared";

describe("GameEngine", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  const players = [
    { userId: "u1", username: "alice", color: "red" },
    { userId: "u2", username: "bob", color: "blue" },
    { userId: "u3", username: "carol", color: "green" },
    { userId: "u4", username: "dave", color: "pink" },
  ];

  describe("createMatch", () => {
    it("creates a match with players at spawn", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1");
      expect(match).toBeDefined();
      expect(match!.players.size).toBe(4);
    });

    it("assigns roles (1 impostor for 4 players)", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1")!;
      const impostors = [...match.players.values()].filter((p) => p.role === "IMPOSTOR");
      expect(impostors.length).toBe(1);
    });

    it("spawns players in cafeteria area", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1")!;
      for (const p of match.players.values()) {
        // spawn center 25,25 — players within ~3 tiles
        expect(Math.abs(p.x - 25)).toBeLessThan(4);
        expect(Math.abs(p.y - 25)).toBeLessThan(4);
      }
    });
  });

  describe("tick movement", () => {
    it("moves player right when input is (1,0)", () => {
      engine.createMatch("m1", "ABC234", players);
      const before = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = before.x;

      engine.setInput("m1", "u1", 1, 0, 1);
      engine.tick("m1");

      const after = engine.getMatch("m1")!.players.get("u1")!;
      expect(after.x).toBeGreaterThan(oldX);
      expect(after.facing).toBe("right");
    });

    it("moves player by correct distance in one tick", () => {
      engine.createMatch("m1", "ABC234", players);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = p.x;

      engine.setInput("m1", "u1", 1, 0, 1);
      const payload = engine.tick("m1");

      const expectedDelta = PLAYER_SPEED * (TICK_INTERVAL_MS / 1000);
      const actualDelta = engine.getMatch("m1")!.players.get("u1")!.x - oldX;
      expect(actualDelta).toBeCloseTo(expectedDelta, 4);
    });

    it("normalizes diagonal movement", () => {
      engine.createMatch("m1", "ABC234", players);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = p.x;
      const oldY = p.y;

      engine.setInput("m1", "u1", 1, 1, 1);
      engine.tick("m1");

      const newX = engine.getMatch("m1")!.players.get("u1")!.x;
      const newY = engine.getMatch("m1")!.players.get("u1")!.y;
      const dx = newX - oldX;
      const dy = newY - oldY;
      // diagonal speed should be speed * diagonal_factor
      const expected = PLAYER_SPEED * DIAGONAL_FACTOR * (TICK_INTERVAL_MS / 1000);
      expect(dx).toBeCloseTo(expected, 4);
      expect(dy).toBeCloseTo(expected, 4);
    });

    it("does not move when input is (0,0)", () => {
      engine.createMatch("m1", "ABC234", players);
      const oldX = engine.getMatch("m1")!.players.get("u1")!.x;

      engine.setInput("m1", "u1", 0, 0, 1);
      engine.tick("m1");

      expect(engine.getMatch("m1")!.players.get("u1")!.x).toBe(oldX);
    });

    it("blocks movement into walls", () => {
      engine.createMatch("m1", "ABC234", players);
      // Move player next to a wall and try to push into it
      const p = engine.getMatch("m1")!.players.get("u1")!;
      p.x = 1; // near left border (x=0 is wall)

      engine.setInput("m1", "u1", -1, 0, 1); // try to move left into wall
      engine.tick("m1");

      expect(engine.getMatch("m1")!.players.get("u1")!.x).toBe(1); // didn't move
    });

    it("updates facing direction", () => {
      engine.createMatch("m1", "ABC234", players);

      engine.setInput("m1", "u1", 0, 1, 1); // down
      engine.tick("m1");
      expect(engine.getMatch("m1")!.players.get("u1")!.facing).toBe("down");

      engine.setInput("m1", "u1", 0, -1, 2); // up
      engine.tick("m1");
      expect(engine.getMatch("m1")!.players.get("u1")!.facing).toBe("up");
    });

    it("returns tick payload with all players", () => {
      engine.createMatch("m1", "ABC234", players);
      engine.setInput("m1", "u1", 1, 0, 1);
      const payload = engine.tick("m1");

      expect(payload.players).toHaveLength(4);
      expect(payload.players[0]).toHaveProperty("x");
      expect(payload.players[0]).toHaveProperty("y");
      expect(payload.players[0]).toHaveProperty("facing");
      expect(payload.players[0]).toHaveProperty("isAlive");
    });
  });

  describe("removeMatch", () => {
    it("removes a match", () => {
      engine.createMatch("m1", "ABC234", players);
      engine.removeMatch("m1");
      expect(engine.getMatch("m1")).toBeUndefined();
    });
  });

  describe("findMatchByUser", () => {
    // Regression: a match that never ended cleanly (players dropped) used to
    // shadow the user's new match, so their inputs went to the stale one.
    it("prefers the newest in-progress match when an older one lingers", () => {
      engine.createMatch("old", "OLD123", players);
      engine.createMatch("new", "NEW123", players);
      expect(engine.findMatchByUser("u1")!.matchId).toBe("new");

      engine.setInput("new", "u1", 1, 0, 1);
      engine.tick("new");
      expect(engine.getMatch("new")!.players.get("u1")!.x).toBeGreaterThan(
        engine.getMatch("old")!.players.get("u1")!.x
      );
    });

    it("skips ended matches in favour of an in-progress one", () => {
      engine.createMatch("a", "AAA123", players);
      engine.createMatch("b", "BBB123", players);
      engine.getMatch("b")!.status = "ENDED";
      expect(engine.findMatchByUser("u1")!.matchId).toBe("a");
    });
  });
});
