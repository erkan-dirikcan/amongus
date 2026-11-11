export interface AuthUser {
  id: string;
  username: string;
}

export interface LobbyPlayerState {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  hasPassword: boolean;
  players: LobbyPlayerState[];
  status: "LOBBY" | "STARTING";
  maxPlayers: number;
}

export type PlayerRole = "IMPOSTOR" | "CREW";

export interface GameStartedPlayer {
  userId: string;
  username: string;
  color: string;
}

export interface GameStartedPayload {
  /** Present on rejoin: bodies already on the floor. */
  corpses?: { corpseId: string; x: number; y: number; color: string }[];
  /** Present on rejoin: false when the player died while away. */
  isAlive?: boolean;
  matchId: string;
  role: PlayerRole;
  players: GameStartedPlayer[];
  spawn: { x: number; y: number };
  /** Only populated for Impostor players so they know their teammate(s). */
  impostorIds?: string[];
  /** Set client-side by the game screen so GameScene can identify the local player synchronously. */
  myUserId?: string;
}

export interface TickPlayer {
  userId: string;
  x: number;
  y: number;
  facing: string;
  isAlive: boolean;
  inVent?: boolean;
}

export interface GameTickPayload {
  players: TickPlayer[];
}

export interface TaskClient {
  id: string;
  type: "wire" | "download" | "cardSwipe" | "asteroids" | "fuel" | "medbayScan";
  room: string;
  x: number;
  y: number;
  completed: boolean;
  /** Visual tasks (medbayScan) broadcast an animation while running. */
  isVisual?: boolean;
}

export interface CorpseClient {
  id: string;
  x: number;
  y: number;
  color: string;
}

export interface MeetingPlayerInfo {
  userId: string;
  username: string;
  color: string;
  isAlive: boolean;
}

export interface GameEndedPlayer {
  userId: string;
  username: string;
  color: string;
  role: PlayerRole;
  isAlive: boolean;
}
