import { LOBBY_COLORS, MAX_PLAYERS, MIN_PLAYERS } from "@amongus/shared";
import { generateLobbyCode } from "./codes.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { Lobby, LobbyPlayer } from "./types.js";
import type { LobbyState, LobbyPlayerState } from "@amongus/shared";

export type LobbyErrorCode =
  | "already_in_lobby"
  | "not_found"
  | "full"
  | "wrong_password"
  | "not_in_lobby"
  | "color_taken"
  | "invalid_color"
  | "not_host"
  | "not_enough_players"
  | "already_starting";

export type LobbyResult = { lobby: Lobby } | { error: LobbyErrorCode };

interface PlayerRef {
  userId: string;
  username: string;
  socketId: string;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private userIndex = new Map<string, string>(); // userId → code

  // Async because hashPassword (bcrypt) is async
  async createLobby(
    host: PlayerRef,
    password?: string
  ): Promise<{ lobby: Lobby; code: string } | { error: LobbyErrorCode }> {
    if (this.userIndex.has(host.userId)) {
      return { error: "already_in_lobby" };
    }
    let code = generateLobbyCode();
    while (this.lobbies.has(code)) {
      code = generateLobbyCode();
    }
    const player: LobbyPlayer = {
      userId: host.userId,
      username: host.username,
      color: LOBBY_COLORS[0],
      isReady: false,
      isHost: true,
      socketId: host.socketId,
      joinedAt: Date.now(),
    };
    const lobby: Lobby = {
      code,
      hostId: host.userId,
      players: [player],
      status: "LOBBY",
      createdAt: Date.now(),
      maxPlayers: MAX_PLAYERS,
    };
    if (password) {
      lobby.passwordHash = await hashPassword(password);
    }
    this.lobbies.set(code, lobby);
    this.userIndex.set(host.userId, code);
    return { lobby, code };
  }

  // Async because password verification (bcrypt) is async
  async joinLobby(
    code: string,
    player: PlayerRef,
    password?: string
  ): Promise<LobbyResult> {
    if (this.userIndex.has(player.userId)) {
      return { error: "already_in_lobby" };
    }
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      return { error: "not_found" };
    }
    if (lobby.players.length >= lobby.maxPlayers) {
      return { error: "full" };
    }
    if (lobby.passwordHash) {
      if (!password) return { error: "wrong_password" };
      const valid = await verifyPassword(password, lobby.passwordHash);
      if (!valid) return { error: "wrong_password" };
    }
    const takenColors = new Set(lobby.players.map((p) => p.color));
    const freeColor = LOBBY_COLORS.find((c) => !takenColors.has(c)) ?? LOBBY_COLORS[0];
    const newPlayer: LobbyPlayer = {
      userId: player.userId,
      username: player.username,
      color: freeColor,
      isReady: false,
      isHost: false,
      socketId: player.socketId,
      joinedAt: Date.now(),
    };
    lobby.players.push(newPlayer);
    this.userIndex.set(player.userId, code);
    return { lobby };
  }

  leaveLobby(userId: string): { lobby?: Lobby; removed: boolean } {
    const code = this.userIndex.get(userId);
    if (!code) return { removed: false };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { removed: false };
    lobby.players = lobby.players.filter((p) => p.userId !== userId);
    this.userIndex.delete(userId);
    if (lobby.players.length === 0) {
      this.lobbies.delete(code);
      return { removed: true };
    }
    if (lobby.hostId === userId) {
      this.transferHost(lobby);
    }
    return { lobby, removed: true };
  }

  leaveLobbyBySocket(socketId: string): { lobby?: Lobby; removed: boolean } {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.find((p) => p.socketId === socketId);
      if (player) {
        return this.leaveLobby(player.userId);
      }
    }
    return { removed: false };
  }

  private transferHost(lobby: Lobby): void {
    const earliest = lobby.players.reduce((min, p) => (p.joinedAt < min.joinedAt ? p : min));
    earliest.isHost = true;
    lobby.hostId = earliest.userId;
    for (const p of lobby.players) {
      if (p.userId !== earliest.userId) p.isHost = false;
    }
  }

  toggleReady(userId: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) return { error: "not_in_lobby" };
    player.isReady = !player.isReady;
    return { lobby };
  }

  setColor(userId: string, color: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    if (!LOBBY_COLORS.includes(color as never)) {
      return { error: "invalid_color" };
    }
    const taken = lobby.players.find((p) => p.color === color && p.userId !== userId);
    if (taken) {
      return { error: "color_taken" };
    }
    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) return { error: "not_in_lobby" };
    player.color = color;
    return { lobby };
  }

  startLobby(userId: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    if (lobby.hostId !== userId) return { error: "not_host" };
    if (lobby.status === "STARTING") return { error: "already_starting" };
    if (lobby.players.length < MIN_PLAYERS) return { error: "not_enough_players" };
    lobby.status = "STARTING";
    return { lobby };
  }

  getLobbyByCode(code: string): Lobby | undefined {
    return this.lobbies.get(code);
  }

  getLobbyByUser(userId: string): Lobby | undefined {
    const code = this.userIndex.get(userId);
    if (!code) return undefined;
    return this.lobbies.get(code);
  }

  getLobbyBySocket(socketId: string): Lobby | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.players.some((p) => p.socketId === socketId)) {
        return lobby;
      }
    }
    return undefined;
  }

  toLobbyState(lobby: Lobby): LobbyState {
    const players: LobbyPlayerState[] = lobby.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      color: p.color,
      isReady: p.isReady,
      isHost: p.isHost,
    }));
    return {
      code: lobby.code,
      hostId: lobby.hostId,
      hasPassword: !!lobby.passwordHash,
      players,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
    };
  }
}
