import { describe, it, expect } from "vitest";
import { KILL_COOLDOWN_MS, KILL_DISTANCE, TASK_INTERACT_DISTANCE, TASKS_PER_CREWMATE, TASK_TYPES } from "./constants.js";
import { TASK_EVENTS } from "./types.js";

describe("kill & task constants", () => {
  it("has correct kill cooldown", () => {
    expect(KILL_COOLDOWN_MS).toBe(30000);
  });

  it("has correct distances", () => {
    expect(KILL_DISTANCE).toBe(1.5);
    expect(TASK_INTERACT_DISTANCE).toBe(1.5);
  });

  it("assigns 2 tasks per crewmate", () => {
    expect(TASKS_PER_CREWMATE).toBe(2);
  });

  it("defines 6 task types", () => {
    expect(TASK_TYPES).toEqual(["wire", "download", "cardSwipe", "asteroids", "fuel", "medbayScan"]);
  });

  it("defines task event names", () => {
    expect(TASK_EVENTS.TASK_COMPLETE).toBe("game:taskComplete");
    expect(TASK_EVENTS.KILL).toBe("game:kill");
    expect(TASK_EVENTS.PLAYER_KILLED).toBe("game:playerKilled");
    expect(TASK_EVENTS.CORPSE_ADDED).toBe("game:corpseAdded");
  });
});
