import { PLAYER_SPEED, DIAGONAL_FACTOR, TICK_INTERVAL_MS } from "@amongus/shared";
import type { GameTickPayload, TickPlayer } from "@amongus/shared";
import { assignRoles } from "./roles.js";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "./mapData.js";
import type { GameState, GamePlayer } from "./types.js";

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
      });
    });

    this.matches.set(matchId, {
      matchId,
      code,
      status: "IN_PROGRESS",
      players: playerMap,
      tickRate: 20,
      createdAt: Date.now(),
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

  getActiveMatchIds(): string[] {
    return [...this.matches.values()]
      .filter((m) => m.status === "IN_PROGRESS")
      .map((m) => m.matchId);
  }

  removeMatch(matchId: string): void {
    this.matches.delete(matchId);
  }
}
