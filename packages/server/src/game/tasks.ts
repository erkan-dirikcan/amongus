import type { Task, GamePlayer } from "./types.js";
import { TASKS_PER_CREWMATE } from "@amongus/shared";
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
];

/**
 * Create and assign tasks to crewmates.
 * Each crewmate gets TASKS_PER_CREWMATE tasks.
 * Returns a Map of taskId → Task.
 */
export function createTasks(crewmates: { userId: string }[]): Map<string, Task> {
  const tasks = new Map<string, Task>();
  const locations = [...TASK_LOCATIONS];

  let locationIdx = 0;
  for (const crewmate of crewmates) {
    for (let i = 0; i < TASKS_PER_CREWMATE; i++) {
      const loc = locations[locationIdx % locations.length];
      const taskId = `task-${crewmate.userId}-${i}`;
      tasks.set(taskId, {
        id: taskId,
        type: loc.type,
        room: loc.room,
        x: loc.x,
        y: loc.y,
        assignedTo: crewmate.userId,
        completed: false,
      });
      locationIdx++;
    }
  }

  return tasks;
}
