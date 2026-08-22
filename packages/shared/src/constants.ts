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
export const TASK_TYPES = ["wire", "download", "cardSwipe", "asteroids", "fuel", "medbayScan"] as const;

/** Max instances of the same task type assigned to one player. */
export const MAX_SAME_TYPE_PER_PLAYER = 2;

/** Duration of the Medbay visual scan (ms). */
export const MEDBAY_SCAN_DURATION_MS = 15000;

// ─── Meeting constants ─────────────────────────────────────────────────

export const MEETING_DURATION_MS = 90000;  // 90 seconds
export const EMERGENCY_BUTTON_TILE = { x: 25, y: 25 }; // cafeteria center

// ─── Vent & Sabotage constants ─────────────────────────────────────────

export const SABOTAGE_COOLDOWN_MS = 30000;
export const REACTOR_TIMEOUT_MS = 30000;
export const O2_TIMEOUT_MS = 30000;
export const VENT_INTERACT_DISTANCE = 1.5;

// ─── Monitor constants (Sub-project 6) ─────────────────────────────────

export const MONITOR_TYPES = ["cameras", "admin", "vitals"] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

/** Client polling interval while a monitor panel is open (ms). */
export const MONITOR_QUERY_INTERVAL_MS = 1000;

/** Interaction distance for monitor tiles (tiles). */
export const MONITOR_INTERACT_DISTANCE = 1.5;

/** Rooms shown on the Security Cameras panel. */
export const CAMERA_ROOMS = ["navigation", "weapons", "storage", "reactor"] as const;

export interface MonitorPosition {
  id: string;
  type: MonitorType;
  room: string;
  x: number;
  y: number;
}

/** Interactable monitor tiles on the map. */
export const MONITOR_POSITIONS: MonitorPosition[] = [
  { id: "monitor-cameras", type: "cameras", room: "cafeteria", x: 25, y: 20 },
  { id: "monitor-admin", type: "admin", room: "admin", x: 25, y: 44 },
  { id: "monitor-vitals", type: "vitals", room: "medbay", x: 27, y: 15 },
];
