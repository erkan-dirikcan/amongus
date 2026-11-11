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

  describe("disconnect grace", () => {
    it("freezes a dropped player and kills them only after the grace period", () => {
      engine.createMatch("m1", "ABC234", players, new Map([["u1", "s1"]]));
      const t0 = 1_000_000;
      engine.setInput("m1", "u1", 1, 0, 1);
      engine.markDisconnected("m1", "u1", t0);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      expect(p.socketId).toBe("");
      expect(p.inputDx).toBe(0);

      let r = engine.expireDisconnected("m1", t0 + GameEngine.DISCONNECT_GRACE_MS - 1);
      expect(r.killed).toEqual([]);
      expect(p.isAlive).toBe(true);

      r = engine.expireDisconnected("m1", t0 + GameEngine.DISCONNECT_GRACE_MS);
      expect(r.killed).toEqual(["u1"]);
      expect(p.isAlive).toBe(false);
    });

    it("reattaching within the grace period keeps the player alive", () => {
      engine.createMatch("m1", "ABC234", players, new Map([["u1", "s1"]]));
      const t0 = 1_000_000;
      engine.markDisconnected("m1", "u1", t0);
      engine.reattach("m1", "u1", "s2");
      const r = engine.expireDisconnected("m1", t0 + GameEngine.DISCONNECT_GRACE_MS * 2);
      expect(r.killed).toEqual([]);
      expect(engine.getMatch("m1")!.players.get("u1")!.socketId).toBe("s2");
      expect(r.abandoned).toBe(false); // u1 is connected
    });

    it("reports the match abandoned once everyone is gone past the grace period", () => {
      engine.createMatch("m1", "ABC234", players, new Map(players.map((p) => [p.userId, "s-" + p.userId])));
      const t0 = 1_000_000;
      for (const p of players) engine.markDisconnected("m1", p.userId, t0);
      expect(engine.expireDisconnected("m1", t0 + 1000).abandoned).toBe(false); // still in grace
      expect(engine.expireDisconnected("m1", t0 + GameEngine.DISCONNECT_GRACE_MS).abandoned).toBe(true);
    });
  });

  describe("ghost movement & meeting votes", () => {
    it("allows dead players (ghosts) to move through internal walls", () => {
      engine.createMatch("m1", "ABC234", players);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      p.isAlive = false;
      p.x = 18; // wall tile outside cafeteria
      p.y = 25;

      engine.setInput("m1", "u1", -1, 0, 1);
      engine.tick("m1");

      expect(p.x).toBeLessThan(18);
    });

    it("returns full vote breakdown in endMeeting", () => {
      engine.createMatch("m1", "ABC234", players);
      engine.startMeeting("m1", "emergency", "u1");
      engine.vote("m1", "u1", "u2");
      engine.vote("m1", "u3", "skip");

      const res = engine.endMeeting("m1")!;
      expect(res.votes).toEqual({ u1: "u2", u3: "skip" });
    });
  });
});
