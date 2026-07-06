import { PLAYER_SPEED, DIAGONAL_FACTOR, TICK_INTERVAL_MS, KILL_COOLDOWN_MS, KILL_DISTANCE, TASK_INTERACT_DISTANCE } from "@amongus/shared";
import type { GameTickPayload, TickPlayer } from "@amongus/shared";
import { assignRoles } from "./roles.js";
import { createTasks } from "./tasks.js";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "./mapData.js";
import type { GameState, GamePlayer, Corpse } from "./types.js";

const PLAYER_RADIUS = 0.3; // tile units, for hitbox (PLAYER_HITBOX/TILE_SIZE ≈ 0.625, half ≈ 0.3)

function isWall(x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return true;
  return WALL_GRID[ty][tx];
}

function canMoveTo(newX: number, newY: number): boolean {
  // Check 4 corners of player hitbox
  const r = PLAYER_RADIUS;
  const corners = [
    [newX - r, newY - r],
    [newX + r, newY - r],
    [newX - r, newY + r],
    [newX + r, newY + r],
  ];
  return corners.every(([cx, cy]) => !isWall(cx, cy));
}

function getSpawnPosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / total) * Math.PI * 2;
  const radius = 2;
  return {
    x: SPAWN_CENTER.x + Math.cos(angle) * radius,
    y: SPAWN_CENTER.y + Math.sin(angle) * radius,
  };
}

export class GameEngine {
  private matches = new Map<string, GameState>();

  createMatch(
    matchId: string,
    code: string,
    players: { userId: string; username: string; color: string }[],
    socketIdMap?: Map<string, string>
  ): void {
    const roles = assignRoles(players.map((p) => p.userId));
    const playerMap = new Map<string, GamePlayer>();

    players.forEach((p, i) => {
      const spawn = getSpawnPosition(i, players.length);
      playerMap.set(p.userId, {
        userId: p.userId,
        username: p.username,
        color: p.color,
        role: roles.get(p.userId)!,
        isAlive: true,
        x: spawn.x,
        y: spawn.y,
        inputDx: 0,
        inputDy: 0,
        facing: "down",
        lastInputSeq: 0,
        socketId: socketIdMap?.get(p.userId) ?? "",
        killCooldownUntil: Date.now() + KILL_COOLDOWN_MS,
      });
    });

    const crewmates = [...playerMap.values()].filter((p) => p.role === "CREW");
    const tasks = createTasks(crewmates);

    this.matches.set(matchId, {
      matchId,
      code,
      status: "IN_PROGRESS",
      players: playerMap,
      tickRate: 20,
      createdAt: Date.now(),
      tasks,
      taskProgress: { total: tasks.size, completed: 0 },
      corpses: [],
    });
  }

  setInput(matchId: string, userId: string, dx: number, dy: number, seq: number): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    const player = match.players.get(userId);
    if (!player) return;
    if (seq <= player.lastInputSeq) return; // ignore stale inputs
    player.inputDx = dx;
    player.inputDy = dy;
    player.lastInputSeq = seq;
  }

  tick(matchId: string): GameTickPayload {
    const match = this.matches.get(matchId);
    if (!match) return { players: [] };

    const delta = TICK_INTERVAL_MS / 1000; // 0.05s
    const tickPlayers: TickPlayer[] = [];

    for (const player of match.players.values()) {
      if (!player.isAlive) {
        tickPlayers.push({
          userId: player.userId,
          x: player.x,
          y: player.y,
          facing: player.facing,
          isAlive: false,
        });
        continue;
      }

      let dx = player.inputDx;
      let dy = player.inputDy;

      // Normalize diagonal
      if (dx !== 0 && dy !== 0) {
        dx *= DIAGONAL_FACTOR;
        dy *= DIAGONAL_FACTOR;
      }

      const moveX = dx * PLAYER_SPEED * delta;
      const moveY = dy * PLAYER_SPEED * delta;

      // Try X movement
      const newX = player.x + moveX;
      if (canMoveTo(newX, player.y)) {
        player.x = newX;
      }

      // Try Y movement
      const newY = player.y + moveY;
      if (canMoveTo(player.x, newY)) {
        player.y = newY;
      }

      // Update facing
      if (Math.abs(dy) > Math.abs(dx)) {
        player.facing = dy < 0 ? "up" : dy > 0 ? "down" : player.facing;
      } else if (dx !== 0) {
        player.facing = dx < 0 ? "left" : "right";
      }

      tickPlayers.push({
        userId: player.userId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        isAlive: player.isAlive,
      });
    }

    return { players: tickPlayers };
  }

  getMatch(matchId: string): GameState | undefined {
    return this.matches.get(matchId);
  }

  findMatchByUser(userId: string): GameState | undefined {
    for (const match of this.matches.values()) {
      if (match.players.has(userId)) return match;
    }
    return undefined;
  }

  findMatchBySocket(socketId: string): GameState | undefined {
    for (const match of this.matches.values()) {
      for (const player of match.players.values()) {
        if (player.socketId === socketId) return match;
      }
    }
    return undefined;
  }

  getActiveMatchIds(): string[] {
    return [...this.matches.values()]
      .filter((m) => m.status === "IN_PROGRESS")
      .map((m) => m.matchId);
  }

  removeMatch(matchId: string): void {
    this.matches.delete(matchId);
  }

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
}
