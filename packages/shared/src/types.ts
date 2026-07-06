// API request/response types shared between client and server

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
