import type { PlayerRole, PlayerFacing, TaskType, SabotageType } from "@amongus/shared";

export interface SabotageState {
  type: SabotageType;
  active: boolean;
  startedAt: number;
  expiresAt?: number;
  holders: Set<string>;
  repairProgress: number;
}

export interface Task {
  id: string;
  type: TaskType;
  room: string;
  x: number;
  y: number;
  assignedTo: string;
  completed: boolean;
}

export interface Corpse {
  id: string;
  victimId: string;
  victimColor: string;
  x: number;
  y: number;
}

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
  killCooldownUntil: number;
  inVent: boolean;
}

export interface MeetingState {
  matchId: string;
  reason: "report" | "emergency";
  reporterId: string;
  victimId?: string;
  startedAt: number;
  durationMs: number;
  votes: Map<string, string | "skip">;
}

export interface GameState {
  matchId: string;
  code: string;
  status: "IN_PROGRESS" | "ENDED";
  players: Map<string, GamePlayer>;
  tickRate: number;
  createdAt: number;
  tasks: Map<string, Task>;
  taskProgress: { total: number; completed: number };
  corpses: Corpse[];
  meetingState: MeetingState | null;
  emergencyUsed: Set<string>;
  sabotage: SabotageState | null;
  sabotageCooldownUntil: number;
}
