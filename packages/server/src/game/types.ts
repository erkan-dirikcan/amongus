import type { PlayerRole, PlayerFacing } from "@amongus/shared";

export interface GamePlayer {
  userId: string;
  username: string;
  color: string;
  role: PlayerRole;
  isAlive: boolean;
  x: number;
  y: number;
  inputDx: number;
  inputDy: number;
  facing: PlayerFacing;
  lastInputSeq: number;
  socketId: string;
}

export interface GameState {
  matchId: string;
  code: string;
  status: "IN_PROGRESS" | "ENDED";
  players: Map<string, GamePlayer>;
  tickRate: number;
  createdAt: number;
}
