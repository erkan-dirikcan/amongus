import { describe, it, expect } from "vitest";
import { createTasks, TASK_LOCATIONS } from "../src/game/tasks.js";
import { TASKS_PER_CREWMATE, MAX_SAME_TYPE_PER_PLAYER, TASK_TYPES } from "@amongus/shared";

describe("createTasks", () => {
  const crewmates = [
    { userId: "u1" },
    { userId: "u2" },
    { userId: "u3" },
  ];

  it("creates correct number of tasks", () => {
    const tasks = createTasks(crewmates);
    expect(tasks.size).toBe(crewmates.length * TASKS_PER_CREWMATE);
    expect(tasks.size).toBe(6);
  });

  it("assigns tasks to crewmates", () => {
    const tasks = createTasks(crewmates);
    for (const c of crewmates) {
      const playerTasks = [...tasks.values()].filter((t) => t.assignedTo === c.userId);
      expect(playerTasks.length).toBe(TASKS_PER_CREWMATE);
    }
  });

  it("creates tasks with valid types", () => {
    const tasks = createTasks(crewmates);
    for (const t of tasks.values()) {
      expect(TASK_TYPES).toContain(t.type);
    }
  });

  it("never exceeds the same-type cap per player", () => {
    for (let run = 0; run < 50; run++) {
      const tasks = createTasks(crewmates);
      for (const c of crewmates) {
        const byType = new Map<string, number>();
        for (const t of tasks.values()) {
          if (t.assignedTo !== c.userId) continue;
          byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
        }
        for (const count of byType.values()) {
          expect(count).toBeLessThanOrEqual(MAX_SAME_TYPE_PER_PLAYER);
        }
      }
    }
  });

  it("distributes all 6 task types across many crewmates", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ userId: `u${i}` }));
    const seen = new Set<string>();
    for (const t of createTasks(many).values()) {
      seen.add(t.type);
    }
    expect(seen.size).toBe(TASK_TYPES.length);
  });

  it("marks only medbayScan as visual", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ userId: `u${i}` }));
    const tasks = [...createTasks(many).values()];
    const scans = tasks.filter((t) => t.type === "medbayScan");
    expect(scans.length).toBeGreaterThan(0);
    expect(scans.every((t) => t.isVisual === true)).toBe(true);
    expect(tasks.filter((t) => t.type !== "medbayScan").every((t) => t.isVisual === undefined)).toBe(true);
  });

  it("creates tasks with coordinates", () => {
    const tasks = createTasks(crewmates);
    for (const t of tasks.values()) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(50);
      expect(t.y).toBeLessThan(50);
    }
  });

  it("all tasks start uncompleted", () => {
    const tasks = createTasks(crewmates);
    for (const t of tasks.values()) {
      expect(t.completed).toBe(false);
    }
  });
});

describe("TASK_LOCATIONS", () => {
  it("has at least 16 locations", () => {
    expect(TASK_LOCATIONS.length).toBeGreaterThanOrEqual(16);
  });

  it("includes every task type", () => {
    const types = new Set(TASK_LOCATIONS.map((l) => l.type));
    expect(types).toEqual(new Set(TASK_TYPES));
  });
});
