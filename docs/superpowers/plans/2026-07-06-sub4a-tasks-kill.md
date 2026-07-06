# Sub-project 4A: Görevler + Kill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Crewmate görevleri (2 mini-oyun), Impostor kill mekanikleri, ceset/hayalet sistemi, ve iki kazanma koşulu ekleyerek Sub-project 3'teki oyun çekirdeğini oynanabilir hale getirmek.

**Architecture:** Server GameEngine'e task/corpse/kill mantığı eklenir. Client'a HTML overlay mini-oyunları (Wire, Download), kill butonu, ceset sprite'ları ve progress bar eklenir. Tüm mekanikler sunucu-otoriteridir (doğrulama server'da).

**Tech Stack:** Mevcut yığın (Express, Socket.io, Phaser, Prisma) + HTML overlay mini-oyunları.

## Global Constraints

- Node 24+, TS strict, ESM .js imports, English code, conventional commits, master branch
- Server-authoritative: tüm doğrulama server'da (mesafe, rol, cooldown)
- Kill cooldown: 30000ms (30sn), kill distance: 1.5 tile, task interact distance: 1.5 tile
- Her crewmate'e 2 görev atanır
- Roller gizli kalır
- Commit directly on master

---

## Task 1: Shared — Kill/Task Constants + Types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/src/killtask.test.ts`

**Interfaces:**
- Produces: `KILL_COOLDOWN_MS`, `KILL_DISTANCE`, `TASK_INTERACT_DISTANCE`, `TASKS_PER_CREWMATE`, `TaskType`, `TaskClient`, `CorpseClient`, kill/task event payload types

- [ ] **Step 1: `constants.ts`'ye ekle**

Append to `packages/shared/src/constants.ts`:

```typescript

// ─── Kill & Task constants ─────────────────────────────────────────────

export const KILL_COOLDOWN_MS = 30000;      // 30 seconds
export const KILL_DISTANCE = 1.5;           // tiles
export const TASK_INTERACT_DISTANCE = 1.5;  // tiles
export const TASKS_PER_CREWMATE = 2;
export const TASK_TYPES = ["wire", "download"] as const;
```

- [ ] **Step 2: `types.ts`'ye ekle**

Append to `packages/shared/src/types.ts`:

```typescript

// ─── Task & Kill types ─────────────────────────────────────────────────

export type TaskType = "wire" | "download";

export interface TaskClient {
  id: string;
  type: TaskType;
  room: string;
  x: number;
  y: number;
  completed: boolean;
}

export interface TasksAssignedPayload {
  tasks: TaskClient[];
  total: number;
}

export interface TaskUpdatePayload {
  completed: number;
  total: number;
}

export interface PlayerKilledPayload {
  victimId: string;
  x: number;
  y: number;
}

export interface KillResultPayload {
  success: boolean;
  cooldownUntil: number;
  message?: string;
}

export interface CorpseClient {
  id: string;
  x: number;
  y: number;
  color: string;
}

export interface CorpseAddedPayload {
  corpseId: string;
  x: number;
  y: number;
  color: string;
}

export interface ReportResultPayload {
  success: boolean;
  message: string;
}

export interface GameEndedPayload {
  winner: "CREW" | "IMPOSTOR";
}

export const TASK_EVENTS = {
  TASK_COMPLETE: "game:taskComplete",
  TASKS_ASSIGNED: "game:tasksAssigned",
  TASK_UPDATE: "game:taskUpdate",
  KILL: "game:kill",
  PLAYER_KILLED: "game:playerKilled",
  KILL_RESULT: "game:killResult",
  CORPSE_ADDED: "game:corpseAdded",
  REPORT: "game:report",
  REPORT_RESULT: "game:reportResult",
} as const;
```

- [ ] **Step 3: Test — `packages/shared/src/killtask.test.ts`**

```typescript
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

  it("defines 2 task types", () => {
    expect(TASK_TYPES).toEqual(["wire", "download"]);
  });

  it("defines all task/kill event names", () => {
    expect(TASK_EVENTS.TASK_COMPLETE).toBe("game:taskComplete");
    expect(TASK_EVENTS.KILL).toBe("game:kill");
    expect(TASK_EVENTS.PLAYER_KILLED).toBe("game:playerKilled");
    expect(TASK_EVENTS.GAME_ENDED_PLACEHOLDER).toBeUndefined();
  });
});
```

Note: the last test checks there's no `GAME_ENDED_PLACEHOLDER` key — GAME_EVENTS (from Sub-project 3) already has ENDED. Remove that last assertion if it's confusing; replace with:

```typescript
  it("defines task event names", () => {
    expect(TASK_EVENTS.TASK_COMPLETE).toBe("game:taskComplete");
    expect(TASK_EVENTS.KILL).toBe("game:kill");
    expect(TASK_EVENTS.PLAYER_KILLED).toBe("game:playerKilled");
    expect(TASK_EVENTS.CORPSE_ADDED).toBe("game:corpseAdded");
  });
```

- [ ] **Step 4: Run tests, commit**

Run: `cd packages/shared && npx vitest run src/killtask.test.ts`
Expected: PASS — 5 tests

Commit: `feat(shared): add kill/task constants and event types`

---

## Task 2: Server — Task Assignment Logic

**Files:**
- Create: `packages/server/src/game/tasks.ts`
- Modify: `packages/server/src/game/types.ts` (add Task, Corpse types)
- Test: `packages/server/tests/game.tasks.test.ts`

**Interfaces:**
- Produces: `createTasks(crewmates): Map<string, Task>`, `TASK_LOCATIONS`, `Task` type, `Corpse` type

- [ ] **Step 1: Update `packages/server/src/game/types.ts`**

Add these to the file:

```typescript
import type { TaskType } from "@amongus/shared";

export interface Task {
  id: string;
  type: TaskType;
  room: string;
  x: number;
  y: number;
  assignedTo: string;
  completed: boolean;
}

export interface Corpse {
  id: string;
  victimId: string;
  victimColor: string;
  x: number;
  y: number;
}
```

Also add to `GamePlayer` interface: `killCooldownUntil: number;` (default 0)
Also add to `GameState` interface: `tasks: Map<string, Task>;`, `taskProgress: { total: number; completed: number };`, `corpses: Corpse[];`

- [ ] **Step 2: Task locations + creation — `packages/server/src/game/tasks.ts`**

```typescript
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
```

- [ ] **Step 3: Test — `packages/server/tests/game.tasks.test.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests, commit**

Run: `cd packages/server && npx vitest run tests/game.tasks.test.ts`
Expected: PASS — 6 tests

Commit: `feat(server): add task assignment logic with map locations`

---

## Task 3: Server — Kill Logic in GameEngine

**Files:**
- Modify: `packages/server/src/game/engine.ts` (add kill, taskComplete, report, winConditions)
- Modify: `packages/server/src/game/types.ts` (add killCooldownUntil to GamePlayer)
- Test: `packages/server/tests/game.kill.test.ts`

**Interfaces:**
- Produces: `GameEngine.kill()`, `GameEngine.completeTask()`, `GameEngine.report()`, `GameEngine.checkWin()`

- [ ] **Step 1: Update types — `packages/server/src/game/types.ts`**

Add `killCooldownUntil: number;` to `GamePlayer`.
Add `tasks`, `taskProgress`, `corpses` to `GameState`.
Add `Task` and `Corpse` interfaces (from Task 2).

- [ ] **Step 2: Update createMatch — `packages/server/src/game/engine.ts`**

In `createMatch`, after creating players, add task creation and initialize new fields:

```typescript
  createMatch(matchId, code, players, socketIdMap?) {
    // ... existing player creation ...
    // Add killCooldownUntil to each player:
    // killCooldownUntil: Date.now() + KILL_COOLDOWN_MS  (can't kill for first 30s)

    // After playerMap is built:
    const crewmates = [...playerMap.values()].filter((p) => p.role === "CREW");
    const tasks = createTasks(crewmates.map((p) => ({ userId: p.userId })));

    this.matches.set(matchId, {
      matchId,
      code,
      status: "IN_PROGRESS",
      players: playerMap,
      tasks,
      taskProgress: { total: tasks.size, completed: 0 },
      corpses: [],
      tickRate: 20,
      createdAt: Date.now(),
    });
  }
```

- [ ] **Step 3: Add kill/task/report/win methods — `packages/server/src/game/engine.ts`**

```typescript
  kill(matchId: string, killerId: string): { success: boolean; victimId?: string; cooldownUntil?: number; message?: string; corpse?: Corpse } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const killer = match.players.get(killerId);
    if (!killer) return { success: false, message: "Player not found" };
    if (killer.role !== "IMPOSTOR") return { success: false, message: "Only impostors can kill" };
    if (!killer.isAlive) return { success: false, message: "Dead players cannot kill" };

    const now = Date.now();
    if (now < killer.killCooldownUntil) {
      return { success: false, cooldownUntil: killer.killCooldownUntil, message: "Kill on cooldown" };
    }

    // Find nearest alive crewmate within KILL_DISTANCE
    let nearest: GamePlayer | null = null;
    let nearestDist = Infinity;
    for (const p of match.players.values()) {
      if (p.userId === killerId) continue;
      if (!p.isAlive) continue;
      if (p.role !== "CREW") continue; // can only kill crewmates
      const dist = Math.sqrt((p.x - killer.x) ** 2 + (p.y - killer.y) ** 2);
      if (dist <= KILL_DISTANCE && dist < nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    }

    if (!nearest) return { success: false, message: "No target in range" };

    // Kill the victim
    nearest.isAlive = false;
    const now2 = Date.now();
    killer.killCooldownUntil = now2 + KILL_COOLDOWN_MS;

    const corpse: Corpse = {
      id: `corpse-${nearest.userId}-${now2}`,
      victimId: nearest.userId,
      victimColor: nearest.color,
      x: nearest.x,
      y: nearest.y,
    };
    match.corpses.push(corpse);

    return { success: true, victimId: nearest.userId, cooldownUntil: killer.killCooldownUntil, corpse };
  }

  completeTask(matchId: string, userId: string, taskId: string): { success: boolean; taskProgress?: { total: number; completed: number }; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot complete tasks" };
    if (player.role !== "CREW") return { success: false, message: "Only crewmates can complete tasks" };

    const task = match.tasks.get(taskId);
    if (!task) return { success: false, message: "Task not found" };
    if (task.assignedTo !== userId) return { success: false, message: "Task not assigned to you" };
    if (task.completed) return { success: false, message: "Task already completed" };

    // Distance check (server-authoritative)
    const dist = Math.sqrt((task.x - player.x) ** 2 + (task.y - player.y) ** 2);
    if (dist > TASK_INTERACT_DISTANCE) return { success: false, message: "Too far from task" };

    task.completed = true;
    match.taskProgress.completed++;

    return { success: true, taskProgress: match.taskProgress };
  }

  report(matchId: string, userId: string, corpseId: string): { success: boolean; message: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot report" };

    const corpse = match.corpses.find((c) => c.id === corpseId);
    if (!corpse) return { success: false, message: "Corpse not found" };

    const dist = Math.sqrt((corpse.x - player.x) ** 2 + (corpse.y - player.y) ** 2);
    if (dist > TASK_INTERACT_DISTANCE) return { success: false, message: "Too far from corpse" };

    // Placeholder: meeting comes in Sub-project 4B
    return { success: true, message: "Meeting yakinda (Sub-project 4B)" };
  }

  checkWin(matchId: string): "CREW" | "IMPOSTOR" | null {
    const match = this.matches.get(matchId);
    if (!match) return null;

    if (match.taskProgress.completed >= match.taskProgress.total && match.taskProgress.total > 0) {
      return "CREW";
    }

    const aliveCrew = [...match.players.values()].filter((p) => p.role === "CREW" && p.isAlive).length;
    const aliveImpostors = [...match.players.values()].filter((p) => p.role === "IMPOSTOR" && p.isAlive).length;

    if (aliveImpostors === 0) return "CREW";
    if (aliveCrew <= aliveImpostors) return "IMPOSTOR";

    return null;
  }
```

Add necessary imports at top of engine.ts:
```typescript
import { KILL_COOLDOWN_MS, KILL_DISTANCE, TASK_INTERACT_DISTANCE } from "@amongus/shared";
import { createTasks } from "./tasks.js";
import type { Corpse } from "./types.js";
```

- [ ] **Step 4: Test — `packages/server/tests/game.kill.test.ts`**

```typescript
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
```

- [ ] **Step 5: Run tests, commit**

Run: `cd packages/server && npx vitest run tests/game.kill.test.ts`
Expected: PASS — ~14 tests

Commit: `feat(server): add kill, task completion, report, and win conditions to GameEngine`

---

## Task 4: Server — Socket Handlers for Kill/Task/Report

**Files:**
- Modify: `packages/server/src/sockets/gameHandlers.ts`
- Modify: `packages/server/src/sockets/index.ts` (win condition check after kill/task)

**Interfaces:**
- Produces: handlers for game:taskComplete, game:kill, game:report events

- [ ] **Step 1: Add handlers — `packages/server/src/sockets/gameHandlers.ts`**

Add these handlers inside `registerGameHandlers`:

```typescript
  socket.on(TASK_EVENTS.TASK_COMPLETE, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || typeof (payload as any).taskId !== "string") return;
    const { taskId } = payload as { taskId: string };
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;

    const result = engine.completeTask(match.matchId, user.userId, taskId);
    if (result.success) {
      io.to(match.code).emit(TASK_EVENTS.TASK_UPDATE, result.taskProgress!);
      const winner = engine.checkWin(match.matchId);
      if (winner) {
        handleGameEnd(io, engine, match.matchId, winner);
      }
    } else {
      socket.emit(TASK_EVENTS.TASK_UPDATE, engine.getMatch(match.matchId)!.taskProgress);
    }
  });

  socket.on(TASK_EVENTS.KILL, () => {
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.kill(match.matchId, user.userId);
    if (result.success) {
      const victim = match.players.get(result.victimId!)!;
      io.to(match.code).emit(TASK_EVENTS.PLAYER_KILLED, { victimId: result.victimId, x: victim.x, y: victim.y });
      io.to(match.code).emit(TASK_EVENTS.CORPSE_ADDED, {
        corpseId: result.corpse!.id,
        x: result.corpse!.x,
        y: result.corpse!.y,
        color: result.corpse!.victimColor,
      });
      socket.emit(TASK_EVENTS.KILL_RESULT, { success: true, cooldownUntil: result.cooldownUntil! });
      const winner = engine.checkWin(match.matchId);
      if (winner) {
        handleGameEnd(io, engine, match.matchId, winner);
      }
    } else {
      socket.emit(TASK_EVENTS.KILL_RESULT, {
        success: false,
        cooldownUntil: 0,
        message: result.message,
      });
    }
  });

  socket.on(TASK_EVENTS.REPORT, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || typeof (payload as any).corpseId !== "string") return;
    const { corpseId } = payload as { corpseId: string };
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.report(match.matchId, user.userId, corpseId);
    socket.emit(TASK_EVENTS.REPORT_RESULT, result);
  });
```

Add helper function at bottom of file:

```typescript
async function handleGameEnd(io: any, engine: any, matchId: string, winner: "CREW" | "IMPOSTOR"): Promise<void> {
  const match = engine.getMatch(matchId);
  if (!match) return;
  match.status = "ENDED";
  io.to(match.code).emit(GAME_EVENTS.ENDED, { winner });
  engine.removeMatch(matchId);
  // DB update would go here (endedAt, winner, stats) — keep minimal for now
}
```

Add imports: `import { TASK_EVENTS, GAME_EVENTS } from "@amongus/shared";`

- [ ] **Step 2: Wire tasks emission on game start — `packages/server/src/sockets/lobbyHandlers.ts`**

In the START handler, after emitting game:started to each player, also emit tasksAssigned to each crewmate:

```typescript
    // After the game:started emission loop:
    // Emit tasks to each crewmate
    for (const p of gameMatch.players.values()) {
      if (p.role !== "CREW") continue;
      const playerTasks = [...gameMatch.tasks.values()]
        .filter((t) => t.assignedTo === p.userId)
        .map((t) => ({ id: t.id, type: t.type, room: t.room, x: t.x, y: t.y, completed: t.completed }));
      io.to(p.socketId).emit(TASK_EVENTS.TASKS_ASSIGNED, {
        tasks: playerTasks,
        total: gameMatch.taskProgress.total,
      });
    }
```

- [ ] **Step 3: tsc + tests**

Run: `cd packages/server && npx tsc --noEmit`
Run: `cd packages/server && npx vitest run tests/game.kill.test.ts tests/game.engine.test.ts tests/game.tasks.test.ts`

Commit: `feat(server): wire kill/task/report socket handlers and game end logic`

---

## Task 5: Client — Mini-game Overlays (Wire + Download)

**Files:**
- Create: `packages/client/src/minigames/wire.ts`
- Create: `packages/client/src/minigames/download.ts`
- Modify: `packages/client/index.html`
- Modify: `packages/client/public/styles.css`

**Interfaces:**
- Produces: `openWireMinigame(taskId, onComplete)`, `openDownloadMinigame(taskId, onComplete)`

- [ ] **Step 1: HTML overlay elements in `index.html`**

Add inside `#game-screen` section:

```html
        <div id="minigame-overlay" class="minigame-overlay" hidden>
          <div class="minigame-card">
            <h3 id="minigame-title"></h3>
            <div id="minigame-content"></div>
          </div>
        </div>
```

- [ ] **Step 2: CSS styles — append to `packages/client/public/styles.css`**

```css
.minigame-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}
.minigame-card {
  background: #1b263b; border: 2px solid #ffd166;
  border-radius: 12px; padding: 24px; min-width: 360px;
}
.minigame-card h3 { color: #ffd166; margin-bottom: 16px; text-align: center; }
.wire-row { display: flex; align-items: center; gap: 80px; margin: 12px 0; }
.wire-dot { width: 28px; height: 28px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; }
.wire-dot.selected { border-color: #fff; }
.wire-slot { width: 28px; height: 28px; border-radius: 50%; border: 2px dashed #666; cursor: pointer; }
.wire-slot.connected { border-style: solid; border-color: #fff; }
.download-bar { width: 300px; height: 24px; background: #333; border-radius: 12px; overflow: hidden; margin: 16px auto; }
.download-fill { height: 100%; background: #06d6a0; width: 0%; transition: width 0.1s; }
.download-btn { display: block; margin: 12px auto; width: auto; padding: 8px 24px; }
.task-progress {
  position: fixed; top: 12px; left: 12px;
  background: rgba(0,0,0,0.7); color: #fff;
  padding: 8px 16px; border-radius: 8px; z-index: 100;
  font-weight: bold;
}
.kill-btn {
  position: fixed; bottom: 24px; right: 24px;
  width: 80px; height: 80px; border-radius: 50%;
  background: #c62828; color: #fff; border: 3px solid #fff;
  font-size: 28px; cursor: pointer; z-index: 100;
  display: flex; align-items: center; justify-content: center;
}
.kill-btn:disabled { background: #555; opacity: 0.5; cursor: not-allowed; }
.report-btn {
  position: fixed; bottom: 24px; right: 120px;
  width: 60px; height: 60px; border-radius: 50%;
  background: #fbc02d; color: #1b263b; border: 3px solid #fff;
  font-size: 24px; cursor: pointer; z-index: 100;
}
.interact-prompt {
  position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.8); color: #ffd166;
  padding: 8px 20px; border-radius: 8px; z-index: 100;
  font-weight: bold;
}
.game-over {
  position: fixed; inset: 0; background: rgba(0,0,0,0.9);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 300;
}
.game-over h1 { font-size: 3rem; margin-bottom: 24px; }
.game-over .crew-win { color: #06d6a0; }
.game-over .impostor-win { color: #ef476f; }
```

- [ ] **Step 3: Wire minigame — `packages/client/src/minigames/wire.ts`**

```typescript
const WIRE_COLORS = [
  { name: "red", hex: "#e53935" },
  { name: "blue", hex: "#1e88e5" },
  { name: "green", hex: "#43a047" },
  { name: "yellow", hex: "#fdd835" },
];

export function openWireMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "KABLOLARI BAĞLA";
  content.innerHTML = "";

  const shuffled = [...WIRE_COLORS].sort(() => Math.random() - 0.5);
  const connected = new Map<string, string>(); // wireName → slotName
  let selectedWire: string | null = null;

  for (let i = 0; i < WIRE_COLORS.length; i++) {
    const row = document.createElement("div");
    row.className = "wire-row";

    const dot = document.createElement("div");
    dot.className = "wire-dot";
    dot.style.backgroundColor = WIRE_COLORS[i].hex;
    dot.dataset.wire = WIRE_COLORS[i].name;

    const line = document.createElement("div");
    line.style.flex = "1";
    line.style.height = "2px";
    line.style.background = "#444";

    const slot = document.createElement("div");
    slot.className = "wire-slot";
    slot.dataset.slot = shuffled[i].name;

    dot.addEventListener("click", () => {
      document.querySelectorAll(".wire-dot").forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
      selectedWire = WIRE_COLORS[i].name;
    });

    slot.addEventListener("click", () => {
      if (!selectedWire) return;
      const slotColor = shuffled[i].name;
      if (selectedWire === slotColor) {
        connected.set(selectedWire, slotColor);
        slot.style.backgroundColor = WIRE_COLORS.find((c) => c.name === slotColor)!.hex;
        slot.classList.add("connected");
        dot.classList.remove("selected");
        selectedWire = null;
        if (connected.size === WIRE_COLORS.length) {
          closeMinigame();
          onComplete(taskId);
        }
      } else {
        // Wrong match — flash red
        slot.style.borderColor = "#f00";
        setTimeout(() => (slot.style.borderColor = ""), 300);
      }
    });

    row.appendChild(dot);
    row.appendChild(line);
    row.appendChild(slot);
    content.appendChild(row);
  }

  overlay.hidden = false;
}

export function closeMinigame(): void {
  const overlay = document.getElementById("minigame-overlay")!;
  overlay.hidden = true;
  document.getElementById("minigame-content")!.innerHTML = "";
}
```

- [ ] **Step 4: Download minigame — `packages/client/src/minigames/download.ts`**

```typescript
import { closeMinigame } from "./wire.js";

export function openDownloadMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "VERİ İNDİR";
  content.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "download-bar";
  const fill = document.createElement("div");
  fill.className = "download-fill";
  bar.appendChild(fill);
  content.appendChild(bar);

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Başlat";
  content.appendChild(btn);

  let progress = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  btn.addEventListener("click", () => {
    if (interval) return;
    btn.textContent = "İndiriliyor...";
    btn.disabled = true;
    interval = setInterval(() => {
      progress += 3.3;
      if (progress >= 100) {
        progress = 100;
        fill.style.width = "100%";
        if (interval) clearInterval(interval);
        setTimeout(() => {
          closeMinigame();
          onComplete(taskId);
        }, 300);
      } else {
        fill.style.width = `${progress}%`;
      }
    }, 100);
  });

  overlay.hidden = false;
}
```

- [ ] **Step 5: Build + commit**

Run: `cd packages/client && npx vite build`
Expected: success

Commit: `feat(client): add Wire and Download mini-game overlays`

---

## Task 6: Client — GameScene Updates (tasks, kill, corpses)

**Files:**
- Modify: `packages/client/src/phaser/scenes/GameScene.ts`
- Modify: `packages/client/src/screens/game.ts`
- Modify: `packages/client/src/types.ts`

- [ ] **Step 1: Update `packages/client/src/types.ts`**

Add these types:

```typescript
export interface TaskClient {
  id: string;
  type: "wire" | "download";
  room: string;
  x: number;
  y: number;
  completed: boolean;
}

export interface CorpseClient {
  id: string;
  x: number;
  y: number;
  color: string;
}
```

- [ ] **Step 2: Update `packages/client/src/screens/game.ts`**

Full rewrite with task/kill/report/corpse/gameover listeners:

```typescript
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import type { GameStartedPayload, TaskClient } from "../types.js";

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", async (payload: GameStartedPayload) => {
    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    roleEl.textContent = payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.8)" : "rgba(30,100,200,0.8)";
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      if (data.user) {
        startPhaserGame({ ...payload, myUserId: data.user.id });
      } else {
        startPhaserGame(payload);
      }
    } catch {
      startPhaserGame(payload);
    }
  });

  socket.on("game:tasksAssigned", (payload: { tasks: TaskClient[]; total: number }) => {
    // Store tasks in a global for GameScene to read
    window.__gameTasks = payload.tasks;
    window.__gameTaskTotal = payload.total;
    updateTaskProgress(0, payload.total);
  });

  socket.on("game:taskUpdate", (payload: { completed: number; total: number }) => {
    updateTaskProgress(payload.completed, payload.total);
  });

  socket.on("game:playerKilled", () => {
    // GameScene handles corpse rendering via game:corpseAdded
  });

  socket.on("game:corpseAdded", (payload: { corpseId: string; x: number; y: number; color: string }) => {
    window.dispatchEvent(new CustomEvent("game:corpse", { detail: payload }));
  });

  socket.on("game:killResult", (payload: { success: boolean; cooldownUntil: number; message?: string }) => {
    window.dispatchEvent(new CustomEvent("game:killResult", { detail: payload }));
  });

  socket.on("game:reportResult", (payload: { success: boolean; message: string }) => {
    window.dispatchEvent(new CustomEvent("game:reportResult", { detail: payload }));
  });

  socket.on("game:ended", (payload: { winner: "CREW" | "IMPOSTOR" }) => {
    stopPhaserGame();
    showGameOver(payload.winner);
  });
}

function updateTaskProgress(completed: number, total: number): void {
  const el = document.getElementById("task-progress")!;
  document.getElementById("task-completed")!.textContent = String(completed);
  document.getElementById("task-total")!.textContent = String(total);
  el.hidden = false;
}

function showGameOver(winner: "CREW" | "IMPOSTOR"): void {
  const el = document.getElementById("game-over")!;
  const text = document.getElementById("winner-text")!;
  text.textContent = winner === "CREW" ? "🛠️ CREW WINS!" : "🔪 IMPOSTOR WINS!";
  text.className = winner === "CREW" ? "crew-win" : "impostor-win";
  el.hidden = false;

  const btn = document.getElementById("back-to-lobby")!;
  btn.onclick = () => {
    el.hidden = true;
    showScreen("menu");
  };
}

// Global type augmentation
declare global {
  interface Window {
    __gameTasks?: TaskClient[];
    __gameTaskTotal?: number;
  }
}
```

- [ ] **Step 3: Add HTML elements to `index.html`**

Inside `#game-screen`, before closing `</section>`:

```html
        <div id="task-progress" class="task-progress" hidden>
          Görevler: <span id="task-completed">0</span>/<span id="task-total">0</span>
        </div>
        <button id="kill-btn" class="kill-btn" hidden>🔪</button>
        <button id="report-btn" class="report-btn" hidden>📢</button>
        <div id="interact-prompt" class="interact-prompt" hidden>E bas</div>
        <div id="game-over" class="game-over" hidden>
          <h1 id="winner-text"></h1>
          <button id="back-to-lobby">Lobiye Dön</button>
        </div>
```

- [ ] **Step 4: Update GameScene for tasks/kill/corpse**

Add to GameScene class fields:

```typescript
  private tasks: TaskClient[] = [];
  private corpses: { id: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite }[] = [];
  private taskSprites: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private killBtn: HTMLButtonElement | null = null;
  private reportBtn: HTMLButtonElement | null = null;
  private interactPrompt: HTMLElement | null = null;
```

In `create()`:
```typescript
    // Load tasks
    this.tasks = window.__gameTasks || [];

    // Show kill button only for impostor
    this.killBtn = document.getElementById("kill-btn") as HTMLButtonElement;
    if (this.myRole === "IMPOSTOR") {
      this.killBtn.hidden = false;
      this.killBtn.addEventListener("click", () => {
        getSocket().emit("game:kill");
      });
    }

    this.reportBtn = document.getElementById("report-btn") as HTMLButtonElement;
    this.reportBtn.addEventListener("click", () => {
      // Report nearest corpse
      const nearest = this.findNearestCorpse();
      if (nearest) {
        getSocket().emit("game:report", { corpseId: nearest.id });
      }
    });

    this.interactPrompt = document.getElementById("interact-prompt")!;

    // E key for task interaction
    this.input.keyboard!.on("keydown-E", () => {
      this.tryInteractTask();
    });

    // Render task sprites (small colored squares at task locations)
    for (const task of this.tasks) {
      const rect = this.add.rectangle(task.x * TILE_SIZE, task.y * TILE_SIZE, 16, 16, task.type === "wire" ? 0xffd166 : 0x06d6a0);
      rect.setStrokeStyle(2, 0xffffff);
      this.taskSprites.set(task.id, rect);
    }

    // Listen for corpse events
    window.addEventListener("game:corpse", this.onCorpseEvent);
    window.addEventListener("game:killResult", this.onKillResult);
    window.addEventListener("game:reportResult", this.onReportResult);
```

In `update(time: number)`:
```typescript
    // Check for nearby task/corpse for interact prompt
    this.updateInteractPrompt();
    this.updateKillButton(time);
```

Add methods:
```typescript
  private updateInteractPrompt(): void {
    if (!this.interactPrompt || !this.myPlayer) return;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearTask = false;
    for (const task of this.tasks) {
      if (task.completed) continue;
      const dist = Math.sqrt((task.x - myX) ** 2 + (task.y - myY) ** 2);
      if (dist <= 1.5) {
        nearTask = true;
        break;
      }
    }
    const nearCorpse = this.findNearestCorpse();
    if (nearTask || nearCorpse) {
      this.interactPrompt.hidden = false;
      this.interactPrompt.textContent = nearCorpse ? "📢 E - Raporla" : "E - Görev Yap";
      if (nearCorpse) this.reportBtn!.hidden = false;
      else this.reportBtn!.hidden = true;
    } else {
      this.interactPrompt.hidden = true;
      this.reportBtn!.hidden = true;
    }
  }

  private updateKillButton(time: number): void {
    if (!this.killBtn || this.myRole !== "IMPOSTOR" || !this.myPlayer) return;
    // Check if near a crewmate
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    // Simplified: enable button, server validates actual range
    this.killBtn.disabled = false;
  }

  private tryInteractTask(): void {
    if (!this.myPlayer) return;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    for (const task of this.tasks) {
      if (task.completed) continue;
      const dist = Math.sqrt((task.x - myX) ** 2 + (task.y - myY) ** 2);
      if (dist <= 1.5) {
        // Open minigame
        if (task.type === "wire") {
          import("../minigames/wire.js").then(({ openWireMinigame }) => {
            openWireMinigame(task.id, (taskId) => {
              getSocket().emit("game:taskComplete", { taskId });
            });
          });
        } else {
          import("../minigames/download.js").then(({ openDownloadMinigame }) => {
            openDownloadMinigame(task.id, (taskId) => {
              getSocket().emit("game:taskComplete", { taskId });
            });
          });
        }
        break;
      }
    }
  }

  private findNearestCorpse(): { id: string; x: number; y: number } | null {
    if (!this.myPlayer || this.corpses.length === 0) return null;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearest = null;
    let nearestDist = Infinity;
    for (const c of this.corpses) {
      const dist = Math.sqrt((c.x - myX) ** 2 + (c.y - myY) ** 2);
      if (dist <= 1.5 && dist < nearestDist) {
        nearest = { id: c.id, x: c.x, y: c.y };
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private onCorpseEvent = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { corpseId: string; x: number; y: number; color: string };
    const sprite = this.add.sprite(detail.x * TILE_SIZE, detail.y * TILE_SIZE, "player");
    sprite.tint = 0x888888; // grayish for corpse
    sprite.setAngle(90); // lying down
    this.corpses.push({ id: detail.corpseId, x: detail.x, y: detail.y, sprite });
  };

  private onKillResult = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { success: boolean; cooldownUntil: number };
    if (this.killBtn && detail.cooldownUntil) {
      const update = () => {
        const remaining = Math.ceil((detail.cooldownUntil - Date.now()) / 1000);
        if (remaining > 0) {
          this.killBtn!.textContent = `⏳${remaining}`;
          this.killBtn!.disabled = true;
          setTimeout(update, 1000);
        } else {
          this.killBtn!.textContent = "🔪";
          this.killBtn!.disabled = false;
        }
      };
      update();
    }
  };

  private onReportResult = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { success: boolean; message: string };
    const prompt = document.getElementById("interact-prompt")!;
    prompt.textContent = detail.message;
    prompt.hidden = false;
    setTimeout(() => { prompt.hidden = true; }, 3000);
  };

  shutdown(): void {
    window.removeEventListener("game:corpse", this.onCorpseEvent);
    window.removeEventListener("game:killResult", this.onKillResult);
    window.removeEventListener("game:reportResult", this.onReportResult);
    if (this.killBtn) this.killBtn.hidden = true;
    if (this.reportBtn) this.reportBtn.hidden = true;
    if (this.interactPrompt) this.interactPrompt.hidden = true;
    const tp = document.getElementById("task-progress");
    if (tp) tp.hidden = true;
  }
```

- [ ] **Step 5: Build + commit**

Run: `cd packages/client && npx vite build`

Commit: `feat(client): add task interaction, kill button, corpse rendering, and game-over screen`

---

## Task 7: Docs + Tag + Integration Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README status**

Replace `## Status` section:

```markdown
## Status

✅ **Sub-project 1:** Temel Kurulum + Auth
✅ **Sub-project 2:** Lobi Sistemi
✅ **Sub-project 3:** Oyun Çekirdeği (hareket, harita, roller)
✅ **Sub-project 4A:** Görevler + Kill (mini-oyunlar, kill, ceset, kazanma)
- Wire ve Download mini-oyunları
- Impostor kill mekanikleri (cooldown, mesafe)
- Ceset ve hayalet sistemi
- İki kazanma koşulu (görevler / sayı eşitlenir)
- Oyun bitişi ekranı

🚧 **Sonraki:** Sub-project 4B — Meeting & Voting (tam oynanabilir)
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/shared && npx vitest run
cd ../server && npx vitest run tests/game.roles.test.ts tests/game.engine.test.ts tests/game.map.test.ts tests/game.tasks.test.ts tests/game.kill.test.ts tests/auth.password.test.ts tests/auth.jwt.test.ts tests/lobby.codes.test.ts tests/lobby.manager.test.ts
```

- [ ] **Step 3: Commit + tag**

```bash
git add -A
git commit -m "docs: complete Sub-project 4A documentation"
git tag sub-project-4a-complete
```
