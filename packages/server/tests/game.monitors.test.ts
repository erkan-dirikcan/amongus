import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { getMonitorSnapshot, roomAt } from "../src/game/monitors.js";
import { createSabotage } from "../src/game/sabotage.js";
import type { GameState } from "../src/game/types.js";

describe("monitors", () => {
  let engine: GameEngine;
  const players = [
    { userId: "u1", username: "alice", color: "red" },
    { userId: "u2", username: "bob", color: "blue" },
    { userId: "u3", username: "carol", color: "green" },
    { userId: "u4", username: "dave", color: "pink" },
  ];

  beforeEach(() => {
    engine = new GameEngine();
    engine.createMatch("m1", "ABC234", players);
  });

  function crew(i: number) {
    return [...engine.getMatch("m1")!.players.values()].filter((p) => p.role === "CREW")[i];
  }

  function impostor() {
    return [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
  }

  describe("roomAt", () => {
    it("identifies rooms by rect", () => {
      expect(roomAt(25, 25)).toBe("cafeteria");
      expect(roomAt(25, 15)).toBe("medbay");
      expect(roomAt(8, 31)).toBe("electrical");
      expect(roomAt(40, 44)).toBe("o2");
    });

    it("returns undefined outside rooms", () => {
      expect(roomAt(2, 2)).toBeUndefined();
      expect(roomAt(45, 45)).toBeUndefined();
    });
  });

  describe("cameras", () => {
    it("shows players in camera rooms but hides players in vents", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      const imp = impostor();
      // Park everyone outside any room first (spawn circle sits inside cafeteria)
      for (const p of match.players.values()) {
        p.x = 2; p.y = 2;
      }
      c0.x = 40; c0.y = 30; // navigation
      imp.x = 37; imp.y = 20; // weapons
      imp.inVent = true; // vented — must be invisible

      const snap = getMonitorSnapshot(match, "cameras", imp.userId) as Extract<ReturnType<typeof getMonitorSnapshot>, { type: "cameras" }>;
      expect(snap.type).toBe("cameras");
      const nav = snap.rooms.find((r) => r.room === "navigation")!;
      const weapons = snap.rooms.find((r) => r.room === "weapons")!;
      expect(nav.players).toHaveLength(1); // c0
      expect(nav.players[0].color).toBe(c0.color);
      expect(weapons.players).toHaveLength(0); // imp is in vent
    });

    it("shows corpses in camera rooms", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      c0.isAlive = false;
      match.corpses.push({ id: "corpse-1", victimId: c0.userId, victimColor: c0.color, x: 8, y: 20 });

      const snap = getMonitorSnapshot(match, "cameras", "u1") as any;
      const storage = snap.rooms.find((r: any) => r.room === "storage");
      expect(storage.corpses).toHaveLength(1);
    });
  });

  describe("admin table", () => {
    it("counts alive players and corpses; vent players excluded", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      const c1 = crew(1);
      // Park everyone outside any room first, then place the actors
      for (const p of match.players.values()) {
        p.x = 2; p.y = 2;
      }
      c0.x = 25; c0.y = 25; // cafeteria, alive
      c1.x = 25; c1.y = 25; // cafeteria, alive
      c1.inVent = true; // vent — not counted
      match.corpses.push({ id: "corpse-1", victimId: "u4", victimColor: "pink", x: 25, y: 26 }); // corpse in cafeteria

      const snap = getMonitorSnapshot(match, "admin", "u1") as any;
      const cafeteria = snap.rooms.find((r: any) => r.room === "cafeteria");
      // 1 alive (c0; c1 is in vent) + 1 corpse = 2
      expect(cafeteria.count).toBe(2);
    });
  });

  describe("vitals", () => {
    it("reports alive and dead players with time since death", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      c0.isAlive = false;
      c0.diedAt = Date.now() - 5000;

      const snap = getMonitorSnapshot(match, "vitals", "u1") as any;
      const dead = snap.players.find((p: any) => p.userId === c0.userId);
      const alive = snap.players.find((p: any) => p.isAlive === true);
      expect(dead.isAlive).toBe(false);
      expect(dead.deadAgoSec).toBeGreaterThanOrEqual(4);
      expect(alive).toBeDefined();
    });
  });

  describe("comms sabotage", () => {
    it("blinds all monitors with { error: 'comms' }", () => {
      const match = engine.getMatch("m1")!;
      match.sabotage = createSabotage("comms");
      expect(getMonitorSnapshot(match, "cameras", "u1")).toEqual({ error: "comms" });
      expect(getMonitorSnapshot(match, "admin", "u1")).toEqual({ error: "comms" });
      expect(getMonitorSnapshot(match, "vitals", "u1")).toEqual({ error: "comms" });
    });
  });

  describe("startVisualTask (engine)", () => {
    it("validates ownership, distance and visual flag", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      // Inject a visual task for c0
      match.tasks.set("task-vis", {
        id: "task-vis", type: "medbayScan", room: "medbay", x: 22, y: 15,
        assignedTo: c0.userId, completed: false, isVisual: true,
      });

      c0.x = 22; c0.y = 15;
      expect(engine.startVisualTask("m1", c0.userId, "task-vis").success).toBe(true);

      c0.x = 0; c0.y = 0; // too far
      expect(engine.startVisualTask("m1", c0.userId, "task-vis").success).toBe(false);

      c0.x = 22; c0.y = 15;
      const imp = impostor();
      expect(engine.startVisualTask("m1", imp.userId, "task-vis").success).toBe(false); // impostor/foreign task
    });

    it("rejects non-visual tasks", () => {
      const match = engine.getMatch("m1")!;
      const c0 = crew(0);
      const anyTask = [...match.tasks.values()].find((t) => t.assignedTo === c0.userId)!;
      if (!anyTask) return; // c0 got no tasks this seed (unlikely with 16 locations)
      c0.x = anyTask.x; c0.y = anyTask.y;
      const result = engine.startVisualTask("m1", c0.userId, anyTask.id);
      if (!anyTask.isVisual) {
        expect(result.success).toBe(false);
      }
    });
  });
});
