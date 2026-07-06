// Server-internal lobby types. These include socketId and joinedAt which
// are NOT sent to clients (see toLobbyState() in manager.ts for the mapping).

export interface LobbyPlayer {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
  socketId: string;
  joinedAt: number;
}

export interface Lobby {
  code: string;
  hostId: string;
  passwordHash?: string;
  players: LobbyPlayer[];
  status: "LOBBY" | "STARTING";
  createdAt: number;
  maxPlayers: number;
}
