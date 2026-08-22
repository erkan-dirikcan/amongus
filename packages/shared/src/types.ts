// API request/response types shared between client and server

import type { MonitorType } from "./constants.js";

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface ApiError {
  error: string;
  message: string;
}

// ─── Lobby types ──────────────────────────────────────────────────────

/** A player as seen by the client (no socketId/joinedAt — those are server-internal). */
export interface LobbyPlayerState {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
}

/** Full lobby state sent to clients. */
export interface LobbyState {
  code: string;
  hostId: string;
  hasPassword: boolean;
  players: LobbyPlayerState[];
  status: "LOBBY" | "STARTING";
  maxPlayers: number;
}

/** Server → client error event payload. */
export interface LobbyErrorPayload {
  code: string;
  message: string;
}

/** lobby:started event payload. */
export interface LobbyStartedPayload {
  code: string;
}

/** Lobby event names (shared between client and server). */
export const LOBBY_EVENTS = {
  // Client → Server
  CREATE: "lobby:create",
  JOIN: "lobby:join",
  LEAVE: "lobby:leave",
  TOGGLE_READY: "lobby:toggleReady",
  SET_COLOR: "lobby:setColor",
  START: "lobby:start",
  // Server → Client
  STATE: "lobby:state",
  UPDATED: "lobby:updated",
  ERROR: "lobby:error",
  STARTED: "lobby:started",
} as const;

// ─── Game types ────────────────────────────────────────────────────────

export type PlayerRole = "IMPOSTOR" | "CREW";
export type PlayerFacing = "up" | "down" | "left" | "right";

export interface GameStartedPlayer {
  userId: string;
  username: string;
  color: string;
}

export interface GameStartedPayload {
  matchId: string;
  role: PlayerRole;
  players: GameStartedPlayer[];
  spawn: { x: number; y: number };
}

export interface TickPlayer {
  userId: string;
  x: number;
  y: number;
  facing: PlayerFacing;
  isAlive: boolean;
  inVent?: boolean;
}

export interface GameTickPayload {
  players: TickPlayer[];
}

export interface GameInputPayload {
  dx: number;
  dy: number;
  seq: number;
}

export interface GameEndedPayload {
  winner: "CREW" | "IMPOSTOR";
}

export const GAME_EVENTS = {
  INPUT: "game:input",
  STARTED: "game:started",
  TICK: "game:tick",
  ENDED: "game:ended",
} as const;

// ─── Task & Kill types ─────────────────────────────────────────────────

export type TaskType = "wire" | "download" | "cardSwipe" | "asteroids" | "fuel" | "medbayScan";

export interface TaskClient {
  id: string;
  type: TaskType;
  room: string;
  x: number;
  y: number;
  completed: boolean;
  /** Visual tasks (medbayScan) broadcast an animation to nearby players. */
  isVisual?: boolean;
}

export interface TasksAssignedPayload {
  tasks: TaskClient[];
  total: number;
}

export interface TaskUpdatePayload {
  completed: number;
  total: number;
  taskId?: string;
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

// NOTE: GameEndedPayload is intentionally NOT re-declared here — it already
// exists above in the Game types section (winner: "CREW" | "IMPOSTOR").

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

// ─── Meeting types ─────────────────────────────────────────────────────

export interface MeetingPlayerInfo {
  userId: string;
  username: string;
  color: string;
  isAlive: boolean;
}

export interface MeetingStartedPayload {
  reason: "report" | "emergency";
  reporterId: string;
  reporterName: string;
  duration: number;
  players: MeetingPlayerInfo[];
  victimId?: string;
}

export interface MeetingResultPayload {
  ejectedId: string | null;
  ejectedRole: "IMPOSTOR" | "CREW" | null;
  wasTie: boolean;
  votes: Record<string, string | "skip">;
}

export interface VoteUpdatePayload {
  voted: Record<string, boolean>; // userId → has voted
}

export interface ChatMessagePayload {
  userId: string;
  username: string;
  message: string;
}

export const MEETING_EVENTS = {
  EMERGENCY: "game:emergency",
  VOTE: "game:vote",
  MEETING_STARTED: "game:meetingStarted",
  VOTE_UPDATE: "game:voteUpdate",
  MEETING_ENDED: "game:meetingEnded",
  CHAT_MESSAGE: "game:chatMessage",
  SEND_CHAT: "game:sendChat",
} as const;

// ─── Vent & Sabotage types ─────────────────────────────────────────────

export type SabotageType = "lights" | "comms" | "reactor" | "o2";

export interface VentInfo {
  id: string;
  x: number;
  y: number;
  room: string;
}

export interface SabotageStartedPayload {
  type: SabotageType;
  expiresAt?: number;
}

export interface SabotageFixedPayload {
  type: SabotageType;
}

export interface VentStatePayload {
  inVent: boolean;
  ventId?: string;
  availableVents?: VentInfo[];
}

export const VENT_SABOTAGE_EVENTS = {
  VENT_ENTER: "game:ventEnter",
  VENT_MOVE: "game:ventMove",
  VENT_EXIT: "game:ventExit",
  VENT_STATE: "game:ventState",
  SABOTAGE: "game:sabotage",
  SABOTAGE_STARTED: "game:sabotageStarted",
  SABOTAGE_FIXED: "game:sabotageFixed",
  REPAIR_LIGHTS: "game:repairLights",
  REPAIR_COMMS: "game:repairComms",
  REACTOR_HOLD: "game:reactorHold",
  O2_CODE: "game:o2Code",
} as const;

// ─── Monitor & Visual task types (Sub-project 6) ───────────────────────

/** One camera card: players currently visible + corpses in that room. */
export interface CameraRoomSnapshot {
  room: string;
  players: { color: string }[];
  corpses: { color: string }[];
}

/** Admin table: live player count per room (vent hiders excluded, corpses counted). */
export interface AdminRoomCount {
  room: string;
  count: number;
}

/** Vitals: every player's life status. */
export interface VitalsEntry {
  userId: string;
  username: string;
  isAlive: boolean;
  /** Seconds since death, when dead. */
  deadAgoSec?: number;
}

export type MonitorData =
  | { type: "cameras"; rooms: CameraRoomSnapshot[] }
  | { type: "admin"; rooms: AdminRoomCount[] }
  | { type: "vitals"; players: VitalsEntry[] };

/** Server → client monitor snapshot (or comms-sabotage error). */
export interface MonitorResultPayload {
  type: MonitorType;
  data?: MonitorData;
  /** Set to "comms" when comms sabotage blinds all monitors. */
  error?: "comms";
}

/** game:visualTaskStarted — visual task animation broadcast to same-room players. */
export interface VisualTaskStartedPayload {
  userId: string;
  x: number;
  y: number;
  taskType: TaskType;
  durationMs?: number;
}

export const MONITOR_EVENTS = {
  MONITOR_QUERY: "game:monitorQuery",
  MONITOR_RESULT: "game:monitorResult",
  VISUAL_TASK_START: "game:visualTaskStart",
  VISUAL_TASK_STARTED: "game:visualTaskStarted",
} as const;
