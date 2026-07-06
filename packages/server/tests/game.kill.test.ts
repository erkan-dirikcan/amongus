import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { KILL_COOLDOWN_MS, KILL_DISTANCE } from "@amongus/shared";

describe("GameEngine kill/task/win", () => {
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

  describe("createMatch with tasks", () => {
    it("assigns tasks to crewmates only", () => {
      const match = engine.getMatch("m1")!;
      expect(match.tasks.size).toBeGreaterThan(0);
      const crewCount = [...match.players.values()].filter((p) => p.role === "CREW").length;
      expect(match.tasks.size).toBe(crewCount * 2);
    });

    it("initializes taskProgress", () => {
      const match = engine.getMatch("m1")!;
      expect(match.taskProgress.completed).toBe(0);
      expect(match.taskProgress.total).toBe(match.tasks.size);
    });

    it("initializes corpses array empty", () => {
      const match = engine.getMatch("m1")!;
      expect(match.corpses).toEqual([]);
    });

    it("sets kill cooldown on impostors", () => {
      const match = engine.getMatch("m1")!;
      const impostor = [...match.players.values()].find((p) => p.role === "IMPOSTOR")!;
      expect(impostor.killCooldownUntil).toBeGreaterThan(Date.now());
    });
  });

  describe("kill", () => {
    it("fails if player is not impostor", () => {
      const crew = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "CREW")!;
      // Bypass cooldown by setting to 0
      const result = engine.kill("m1", crew.userId);
      expect(result.success).toBe(false);
    });

    it("fails when on cooldown", () => {
      const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
      // cooldown is set to future, so should fail
      const result = engine.kill("m1", impostor.userId);
      expect(result.success).toBe(false);
      expect(result.message).toContain("cooldown");
    });

    it("kills nearest crewmate when off cooldown and in range", () => {
      const match = engine.getMatch("m1")!;
      const impostor = [...match.players.values()].find((p) => p.role === "IMPOSTOR")!;
      const victim = [...match.players.values()].find((p) => p.role === "CREW")!;

      // Clear cooldown
      impostor.killCooldownUntil = 0;
      // Move victim next to impostor
      victim.x = impostor.x + 0.5;
      victim.y = impostor.y;

      const result = engine.kill("m1", impostor.userId);
      expect(result.success).toBe(true);
      expect(result.victimId).toBe(victim.userId);
      expect(victim.isAlive).toBe(false);
    });

    it("fails when no crewmate in range", () => {
      const match = engine.getMatch("m1")!;
      const impostor = [...match.players.values()].find((p) => p.role === "IMPOSTOR")!;
      const victim = [...match.players.values()].find((p) => p.role === "CREW")!;

      impostor.killCooldownUntil = 0;
      victim.x = impostor.x + 10; // far away
      victim.y = impostor.y;

      const result = engine.kill("m1", impostor.userId);
      expect(result.success).toBe(false);
      expect(result.message).toContain("No target");
    });

    it("creates a corpse on kill", () => {
      const match = engine.getMatch("m1")!;
      const impostor = [...match.players.values()].find((p) => p.role === "IMPOSTOR")!;
      const victim = [...match.players.values()].find((p) => p.role === "CREW")!;

      impostor.killCooldownUntil = 0;
      victim.x = impostor.x + 0.5;
      victim.y = impostor.y;

      engine.kill("m1", impostor.userId);
      expect(match.corpses.length).toBe(1);
      expect(match.corpses[0].victimId).toBe(victim.userId);
    });

    it("sets new cooldown after kill", () => {
      const match = engine.getMatch("m1")!;
      const impostor = [...match.players.values()].find((p) => p.role === "IMPOSTOR")!;
      const victim = [...match.players.values()].find((p) => p.role === "CREW")!;

      impostor.killCooldownUntil = 0;
      victim.x = impostor.x + 0.5;
      victim.y = impostor.y;

      engine.kill("m1", impostor.userId);
      expect(impostor.killCooldownUntil).toBeGreaterThan(Date.now());
    });
  });

  describe("completeTask", () => {
    it("completes an assigned task when near", () => {
      const match = engine.getMatch("m1")!;
      const crew = [...match.players.values()].filter((p) => p.role === "CREW")[0];
      const task = [...match.tasks.values()].find((t) => t.assignedTo === crew.userId)!;

      crew.x = task.x;
      crew.y = task.y;

      const result = engine.completeTask("m1", crew.userId, task.id);
      expect(result.success).toBe(true);
      expect(task.completed).toBe(true);
      expect(match.taskProgress.completed).toBe(1);
    });

    it("fails if task not assigned to player", () => {
      const match = engine.getMatch("m1")!;
      const crews = [...match.players.values()].filter((p) => p.role === "CREW");
      const task = [...match.tasks.values()].find((t) => t.assignedTo === crews[0].userId)!;
      const otherCrew = crews[1];

      const result = engine.completeTask("m1", otherCrew.userId, task.id);
      expect(result.success).toBe(false);
    });

    it("fails if too far from task", () => {
      const match = engine.getMatch("m1")!;
      const crew = [...match.players.values()].filter((p) => p.role === "CREW")[0];
      const task = [...match.tasks.values()].find((t) => t.assignedTo === crew.userId)!;

      crew.x = 0;
      crew.y = 0;
      // task is at task.x, task.y which is far

      const result = engine.completeTask("m1", crew.userId, task.id);
      expect(result.success).toBe(false);
    });
  });

  describe("checkWin", () => {
    it("returns CREW when all tasks completed", () => {
      const match = engine.getMatch("m1")!;
      match.taskProgress.completed = match.taskProgress.total;
      expect(engine.checkWin("m1")).toBe("CREW");
    });

    it("returns IMPOSTOR when crew count <= impostor count", () => {
      const match = engine.getMatch("m1")!;
      // Kill all but 1 crew (4 players, 1 impostor → kill 2 crew)
      const crews = [...match.players.values()].filter((p) => p.role === "CREW");
      crews[0].isAlive = false;
      crews[1].isAlive = false;
      // Now: 1 crew alive, 1 impostor alive → crew <= impostor
      expect(engine.checkWin("m1")).toBe("IMPOSTOR");
    });

    it("returns null when game ongoing", () => {
      expect(engine.checkWin("m1")).toBeNull();
    });
  });
});
