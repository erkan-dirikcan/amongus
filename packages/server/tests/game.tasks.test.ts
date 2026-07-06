import { describe, it, expect } from "vitest";
import { createTasks, TASK_LOCATIONS } from "../src/game/tasks.js";
import { TASKS_PER_CREWMATE } from "@amongus/shared";

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
      expect(["wire", "download"]).toContain(t.type);
    }
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
  it("has at least 10 locations", () => {
    expect(TASK_LOCATIONS.length).toBeGreaterThanOrEqual(10);
  });
});
