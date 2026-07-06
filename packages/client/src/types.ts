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
