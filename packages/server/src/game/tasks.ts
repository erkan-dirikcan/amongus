import type { Task, GamePlayer } from "./types.js";
import { TASKS_PER_CREWMATE, MAX_SAME_TYPE_PER_PLAYER } from "@amongus/shared";
import type { TaskType } from "@amongus/shared";

// Task locations on the map (tile coordinates matching rooms from mapData.ts)
export const TASK_LOCATIONS: { type: TaskType; room: string; x: number; y: number }[] = [
  { type: "wire", room: "electrical", x: 8, y: 30 },
  { type: "wire", room: "electrical", x: 10, y: 31 },
  { type: "download", room: "storage", x: 8, y: 20 },
  { type: "download", room: "storage", x: 10, y: 19 },
  { type: "wire", room: "cafeteria", x: 25, y: 22 },
  { type: "download", room: "admin", x: 25, y: 42 },
  { type: "wire", room: "weapons", x: 37, y: 20 },
  { type: "download", room: "navigation", x: 40, y: 30 },
  { type: "wire", room: "o2", x: 37, y: 42 },
  { type: "download", room: "reactor", x: 9, y: 42 },
  // Sub-project 6 additions
  { type: "cardSwipe", room: "admin", x: 24, y: 43 },
  { type: "asteroids", room: "weapons", x: 39, y: 21 },
  { type: "fuel", room: "storage", x: 6, y: 21 },
  { type: "medbayScan", room: "medbay", x: 22, y: 15 },
  { type: "download", room: "navigation", x: 41, y: 32 },
  { type: "wire", room: "medbay", x: 28, y: 16 },
];

/** Task types that broadcast an animation while running. */
const VISUAL_TASK_TYPES: ReadonlySet<TaskType> = new Set(["medbayScan"]);

/** Fisher–Yates shuffle (returns a new array). */
function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create and assign tasks to crewmates.
 * Each crewmate gets TASKS_PER_CREWMATE tasks drawn from a shuffled
 * TASK_LOCATIONS pool, preferring types the player doesn't already have
 * (hard-capped at MAX_SAME_TYPE_PER_PLAYER of any single type).
 * Returns a Map of taskId → Task.
 */
export function createTasks(crewmates: { userId: string }[]): Map<string, Task> {
  const tasks = new Map<string, Task>();

  for (const crewmate of crewmates) {
    const pool = shuffled(TASK_LOCATIONS);
    const typeCount = new Map<TaskType, number>();
    const picked: typeof pool = [];

    // Pass 1: only unused types (with 6 types over 16 locations this always fills)
    for (const loc of pool) {
      if (picked.length >= TASKS_PER_CREWMATE) break;
      if (typeCount.has(loc.type)) continue;
      picked.push(loc);
      typeCount.set(loc.type, 1);
    }

    // Pass 2 (fallback): allow repeats up to the cap
    for (const loc of pool) {
      if (picked.length >= TASKS_PER_CREWMATE) break;
      const used = typeCount.get(loc.type) ?? 0;
      if (used >= MAX_SAME_TYPE_PER_PLAYER) continue;
      picked.push(loc);
      typeCount.set(loc.type, used + 1);
    }

    picked.forEach((loc, i) => {
      const taskId = `task-${crewmate.userId}-${i}`;
      tasks.set(taskId, {
        id: taskId,
        type: loc.type,
        room: loc.room,
        x: loc.x,
        y: loc.y,
        assignedTo: crewmate.userId,
        completed: false,
        isVisual: VISUAL_TASK_TYPES.has(loc.type) || undefined,
      });
    });
  }

  return tasks;
}
