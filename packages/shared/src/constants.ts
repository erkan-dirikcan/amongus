// Auth cookie configuration shared between client and server

export const AUTH_COOKIE_NAME = "amongus_token";

// 7 days in milliseconds
export const DEFAULT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Username constraints
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 100;

// ─── Lobby configuration ──────────────────────────────────────────────

/** 12 player colors. Each can be claimed by only one player per lobby. */
export const LOBBY_COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
] as const;

export type LobbyColor = (typeof LOBBY_COLORS)[number];

/** Max players in a lobby (Among Us standard) */
export const MAX_PLAYERS = 10;

/** Min players required to start a game */
export const MIN_PLAYERS = 4;

/** Characters used for lobby codes: A-Z and 2-9 (no 0, 1, O, I for readability) */
export const LOBBY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Lobby code length */
export const LOBBY_CODE_LENGTH = 6;

// Re-exported here so the lobby test's verbatim `import { LOBBY_EVENTS } from "./constants.js"` resolves.
// LOBBY_EVENTS is defined in ./types.ts (per task brief Step 2); types.ts does not import from
// constants.ts, so this re-export introduces no circular dependency.
export { LOBBY_EVENTS } from "./types.js";

// ─── Game constants ────────────────────────────────────────────────────

export const PLAYER_SPEED = 3.0;              // tiles per second
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ; // 50ms
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2); // ~0.707
export const TILE_SIZE = 32;                  // pixels per tile
export const PLAYER_HITBOX = 20;              // pixels (smaller than tile)

/** Number of impostors based on total player count. */
export function getImpostorCount(playerCount: number): number {
  if (playerCount <= 5) return 1;
  if (playerCount <= 7) return 2;
  return Math.min(3, Math.floor(playerCount / 3));
}

// ─── Kill & Task constants ─────────────────────────────────────────────

export const KILL_COOLDOWN_MS = 30000;      // 30 seconds
export const KILL_DISTANCE = 1.5;           // tiles
export const TASK_INTERACT_DISTANCE = 1.5;  // tiles
export const TASKS_PER_CREWMATE = 2;
export const TASK_TYPES = ["wire", "download"] as const;
