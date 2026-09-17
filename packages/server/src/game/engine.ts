import { PLAYER_SPEED, DIAGONAL_FACTOR, TICK_INTERVAL_MS, KILL_COOLDOWN_MS, KILL_DISTANCE, TASK_INTERACT_DISTANCE, MEETING_DURATION_MS, VENT_INTERACT_DISTANCE, SABOTAGE_COOLDOWN_MS } from "@amongus/shared";
import type { GameTickPayload, TickPlayer, VentInfo, SabotageType } from "@amongus/shared";
import { assignRoles } from "./roles.js";
import { tallyVotes } from "./meeting.js";
import { createTasks } from "./tasks.js";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "./mapData.js";
import { VENT_POSITIONS, findVentById } from "./vents.js";
import { createSabotage, checkSabotageTimeout } from "./sabotage.js";
import type { GameState, GamePlayer, Corpse } from "./types.js";

/** Emergency button on the cafeteria table (tile coords) and how close you must be. */
export const EMERGENCY_BUTTON = { x: 25.5, y: 25.5 };
export const EMERGENCY_BUTTON_DISTANCE = 2.5;
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
        inVent: false,
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
      meetingState: null,
      emergencyUsed: new Set(),
      sabotage: null,
      sabotageCooldownUntil: 0,
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

    if (match.meetingState) {
      // During meeting: no movement, return current positions
      const tickPlayers: TickPlayer[] = [...match.players.values()].map((p) => ({
        userId: p.userId, x: p.x, y: p.y, facing: p.facing, isAlive: p.isAlive,
      }));
      return { players: tickPlayers };
    }

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

  /** How long a dropped player may reconnect before counting as dead. */
  static readonly DISCONNECT_GRACE_MS = 30_000;

  /** A player's socket went away: freeze them and start the grace timer. */
  markDisconnected(matchId: string, userId: string, now = Date.now()): void {
    const player = this.matches.get(matchId)?.players.get(userId);
    if (!player) return;
    player.socketId = "";
    player.disconnectedAt = now;
    player.inputDx = 0;
    player.inputDy = 0;
  }

  /** The same user came back: attach the new socket. Returns the player or undefined. */
  reattach(matchId: string, userId: string, socketId: string): GamePlayer | undefined {
    const player = this.matches.get(matchId)?.players.get(userId);
    if (!player) return undefined;
    player.socketId = socketId;
    player.disconnectedAt = undefined;
    return player;
  }

  /**
   * Kill players whose grace period ran out. Returns true when the match has
   * nobody connected any more and nobody who could still come back.
   */
  expireDisconnected(matchId: string, now = Date.now()): { killed: string[]; abandoned: boolean } {
    const match = this.matches.get(matchId);
    if (!match) return { killed: [], abandoned: true };
    const killed: string[] = [];
    let anyoneConnected = false;
    let anyoneInGrace = false;
    for (const p of match.players.values()) {
      if (p.socketId) { anyoneConnected = true; continue; }
      if (p.disconnectedAt === undefined) continue;
      if (now - p.disconnectedAt >= GameEngine.DISCONNECT_GRACE_MS) {
        if (p.isAlive) {
          p.isAlive = false;
          p.diedAt = now;
          killed.push(p.userId);
        }
      } else {
        anyoneInGrace = true;
      }
    }
    return { killed, abandoned: !anyoneConnected && !anyoneInGrace };
  }

  findMatchByUser(userId: string): GameState | undefined {
    // Newest first: if an older match this user was in is still around, the
    // one they are actually playing is the most recently created.
    const matches = [...this.matches.values()].reverse();
    return (
      matches.find((m) => m.status === "IN_PROGRESS" && m.players.has(userId)) ??
      matches.find((m) => m.players.has(userId))
    );
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
    nearest.diedAt = Date.now();
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

  ventEnter(matchId: string, userId: string, ventId: string): { success: boolean; message?: string; vents?: VentInfo[] } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (player.role !== "IMPOSTOR") return { success: false, message: "Only impostors can vent" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot vent" };
    if (player.inVent) return { success: false, message: "Already in vent" };
    if (match.meetingState) return { success: false, message: "Cannot vent during meeting" };

    const vent = findVentById(ventId);
    if (!vent) return { success: false, message: "Vent not found" };
    const dist = Math.sqrt((vent.x - player.x) ** 2 + (vent.y - player.y) ** 2);
    if (dist > VENT_INTERACT_DISTANCE) return { success: false, message: "Too far from vent" };

    player.inVent = true;
    return { success: true, vents: VENT_POSITIONS };
  }

  ventMove(matchId: string, userId: string, targetVentId: string): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    const player = match.players.get(userId);
    if (!player || !player.inVent) return { success: false, message: "Not in vent" };
    const vent = findVentById(targetVentId);
    if (!vent) return { success: false, message: "Target vent not found" };
    player.x = vent.x;
    player.y = vent.y;
    return { success: true };
  }

  ventExit(matchId: string, userId: string): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    const player = match.players.get(userId);
    if (!player || !player.inVent) return { success: false, message: "Not in vent" };
    player.inVent = false;
    return { success: true };
  }

  completeTask(matchId: string, userId: string, taskId: string): { success: boolean; taskProgress?: { total: number; completed: number }; taskId?: string; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
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

    return { success: true, taskProgress: match.taskProgress, taskId };
  }

  /**
   * Validate that a visual task (medbayScan) may start — crewmate, own task,
   * uncompleted, in range. Returns the task position so the handler can
   * broadcast the animation to same-room players.
   */
  startVisualTask(matchId: string, userId: string, taskId: string): { success: boolean; x?: number; y?: number; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (player.role !== "CREW") return { success: false, message: "Only crewmates can start visual tasks" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot start tasks" };

    const task = match.tasks.get(taskId);
    if (!task) return { success: false, message: "Task not found" };
    if (task.assignedTo !== userId) return { success: false, message: "Task not assigned to you" };
    if (!task.isVisual) return { success: false, message: "Not a visual task" };
    if (task.completed) return { success: false, message: "Task already completed" };

    const dist = Math.sqrt((task.x - player.x) ** 2 + (task.y - player.y) ** 2);
    if (dist > TASK_INTERACT_DISTANCE) return { success: false, message: "Too far from task" };

    return { success: true, x: player.x, y: player.y };
  }

  report(matchId: string, userId: string, corpseId: string): { success: boolean; message: string; meetingStarted?: boolean } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };

    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot report" };

    const corpse = match.corpses.find((c) => c.id === corpseId);
    if (!corpse) return { success: false, message: "Corpse not found" };

    const dist = Math.sqrt((corpse.x - player.x) ** 2 + (corpse.y - player.y) ** 2);
    if (dist > TASK_INTERACT_DISTANCE) return { success: false, message: "Too far from corpse" };

    // Start meeting instead of placeholder
    this.startMeeting(matchId, "report", userId, corpse.victimId);
    return { success: true, message: "Meeting started", meetingStarted: true };
  }

  startMeeting(matchId: string, reason: "report" | "emergency", reporterId: string, victimId?: string): boolean {
    const match = this.matches.get(matchId);
    if (!match) return false;
    if (match.meetingState) return false; // already in meeting

    match.meetingState = {
      matchId,
      reason,
      reporterId,
      victimId,
      startedAt: Date.now(),
      durationMs: MEETING_DURATION_MS,
      votes: new Map(),
    };
    return true;
  }

  vote(matchId: string, voterId: string, target: string | "skip"): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    if (!match.meetingState) return { success: false, message: "Not in meeting" };

    const voter = match.players.get(voterId);
    if (!voter) return { success: false, message: "Player not found" };
    if (!voter.isAlive) return { success: false, message: "Dead players cannot vote" };

    // Validate target (must be alive player or skip)
    if (target !== "skip") {
      const targetPlayer = match.players.get(target);
      if (!targetPlayer || !targetPlayer.isAlive) {
        return { success: false, message: "Invalid target" };
      }
    }

    match.meetingState.votes.set(voterId, target);
    return { success: true };
  }

  endMeeting(matchId: string): { ejectedId: string | null; ejectedRole: "IMPOSTOR" | "CREW" | null; wasTie: boolean } | null {
    const match = this.matches.get(matchId);
    if (!match || !match.meetingState) return null;

    const result = tallyVotes(match.meetingState.votes);
    let ejectedRole: "IMPOSTOR" | "CREW" | null = null;

    if (result.ejected) {
      const ejected = match.players.get(result.ejected);
      if (ejected) {
        ejected.isAlive = false;
        ejected.diedAt = Date.now();
        ejectedRole = ejected.role;
      }
    }

    match.meetingState = null;
    return { ejectedId: result.ejected, ejectedRole, wasTie: result.wasTie };
  }

  isInMeeting(matchId: string): boolean {
    const match = this.matches.get(matchId);
    return !!match?.meetingState;
  }

  shouldEndMeeting(matchId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match?.meetingState) return false;
    const elapsed = Date.now() - match.meetingState.startedAt;
    if (elapsed >= match.meetingState.durationMs) return true;
    // End early if all alive players have voted
    const aliveCount = [...match.players.values()].filter((p) => p.isAlive).length;
    return match.meetingState.votes.size >= aliveCount;
  }

  getMeetingVotes(matchId: string): Record<string, boolean> {
    const match = this.matches.get(matchId);
    if (!match?.meetingState) return {};
    const voted: Record<string, boolean> = {};
    for (const player of match.players.values()) {
      if (player.isAlive) {
        voted[player.userId] = match.meetingState.votes.has(player.userId);
      }
    }
    return voted;
  }

  canUseEmergency(matchId: string, userId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match) return false;
    if (match.emergencyUsed.has(userId)) return false;
    const player = match.players.get(userId);
    if (!player || !player.isAlive) return false;
    // Must be at the emergency button (cafeteria table)
    const dist = Math.hypot(player.x - EMERGENCY_BUTTON.x, player.y - EMERGENCY_BUTTON.y);
    return dist <= EMERGENCY_BUTTON_DISTANCE;
  }

  useEmergency(matchId: string, userId: string): void {
    const match = this.matches.get(matchId);
    if (match) match.emergencyUsed.add(userId);
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

  startSabotage(matchId: string, userId: string, type: SabotageType): { success: boolean; message?: string; expiresAt?: number } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (player.role !== "IMPOSTOR") return { success: false, message: "Only impostors can sabotage" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot sabotage" };
    if (match.sabotage) return { success: false, message: "Sabotage already active" };
    const now = Date.now();
    if (now < match.sabotageCooldownUntil) return { success: false, message: "Sabotage on cooldown" };

    const sab = createSabotage(type);
    match.sabotage = sab;
    match.sabotageCooldownUntil = now + SABOTAGE_COOLDOWN_MS;
    return { success: true, expiresAt: sab.expiresAt };
  }

  repairLights(matchId: string, userId: string): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match?.sabotage || match.sabotage.type !== "lights") return { success: false, message: "Lights not sabotaged" };
    const player = match.players.get(userId);
    if (!player?.isAlive) return { success: false, message: "Cannot repair" };
    match.sabotage = null;
    return { success: true };
  }

  repairComms(matchId: string, userId: string, code: string): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match?.sabotage || match.sabotage.type !== "comms") return { success: false, message: "Comms not sabotaged" };
    const player = match.players.get(userId);
    if (!player?.isAlive) return { success: false, message: "Cannot repair" };
    // Code check: stored in repairProgress as a number; for simplicity, any 4-digit code works
    // Real implementation would store the target code and compare
    match.sabotage = null;
    return { success: true };
  }

  reactorHold(matchId: string, userId: string): { success: boolean; message?: string; complete?: boolean } {
    const match = this.matches.get(matchId);
    if (!match?.sabotage || match.sabotage.type !== "reactor") return { success: false, message: "Reactor not sabotaged" };
    const player = match.players.get(userId);
    if (!player?.isAlive) return { success: false, message: "Cannot help" };
    match.sabotage.holders.add(userId);
    if (match.sabotage.holders.size >= 2) {
      match.sabotage = null;
      return { success: true, complete: true };
    }
    return { success: true, complete: false };
  }

  o2Code(matchId: string, userId: string, code: string, location: string): { success: boolean; message?: string; complete?: boolean } {
    const match = this.matches.get(matchId);
    if (!match?.sabotage || match.sabotage.type !== "o2") return { success: false, message: "O2 not sabotaged" };
    const player = match.players.get(userId);
    if (!player?.isAlive) return { success: false, message: "Cannot help" };
    // Two codes needed (admin + o2). Track which locations have been entered.
    match.sabotage.holders.add(`${location}:${code}`);
    if (match.sabotage.holders.size >= 2) {
      match.sabotage = null;
      return { success: true, complete: true };
    }
    return { success: true, complete: false };
  }

  checkSabotageWin(matchId: string): "IMPOSTOR" | null {
    const match = this.matches.get(matchId);
    if (!match?.sabotage) return null;
    if (match.sabotage.type === "reactor" || match.sabotage.type === "o2") {
      if (checkSabotageTimeout(match.sabotage)) {
        match.sabotage = null;
        return "IMPOSTOR";
      }
    }
    return null;
  }
}
