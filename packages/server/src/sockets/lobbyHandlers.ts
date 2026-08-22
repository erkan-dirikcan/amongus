import type { Server as SocketIOServer } from "socket.io";
import type { ExtendedSocket, ExtendedIo } from "./types.js";
import type { LobbyManager, LobbyErrorCode } from "../lobby/manager.js";
import { LOBBY_EVENTS, GAME_EVENTS, TASK_EVENTS, lobbyCreateSchema, lobbyJoinSchema, lobbySetColorSchema } from "@amongus/shared";
import { prisma } from "../db/prisma.js";
import { GameEngine } from "../game/engine.js";

export function registerLobbyHandlers(
  io: ExtendedIo,
  socket: ExtendedSocket,
  mgr: LobbyManager,
  engine: GameEngine
): void {
  const user = socket.data.user;

  socket.on(LOBBY_EVENTS.CREATE, async (payload: unknown) => {
    const parsed = lobbyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid input" });
      return;
    }
    const result = await mgr.createLobby(
      { userId: user.userId, username: user.username, socketId: socket.id },
      parsed.data.password
    );
    if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
      return;
    }
    socket.join(result.code);
    socket.emit(LOBBY_EVENTS.STATE, mgr.toLobbyState(result.lobby));
  });

  socket.on(LOBBY_EVENTS.JOIN, async (payload: unknown) => {
    const parsed = lobbyJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid lobby code" });
      return;
    }
    const result = await mgr.joinLobby(
      parsed.data.code,
      { userId: user.userId, username: user.username, socketId: socket.id },
      parsed.data.password
    );
    if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
      return;
    }
    socket.join(result.lobby.code);
    socket.emit(LOBBY_EVENTS.STATE, mgr.toLobbyState(result.lobby));
    io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
  });

  socket.on(LOBBY_EVENTS.LEAVE, () => {
    const result = mgr.leaveLobby(user.userId);
    if (result.lobby) {
      socket.leave(result.lobby.code);
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    }
  });

  socket.on(LOBBY_EVENTS.TOGGLE_READY, () => {
    const result = mgr.toggleReady(user.userId);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
    }
  });

  socket.on(LOBBY_EVENTS.SET_COLOR, (payload: unknown) => {
    const parsed = lobbySetColorSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid color" });
      return;
    }
    const result = mgr.setColor(user.userId, parsed.data.color);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
    }
  });

  socket.on(LOBBY_EVENTS.START, async () => {
    const result = mgr.startLobby(user.userId);
    if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
      return;
    }

    const lobby = result.lobby;
    io.to(lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(lobby));

    try {
      // Create match in DB
      const match = await prisma.match.create({
        data: {
          code: lobby.code,
          hostId: lobby.hostId,
          status: "IN_PROGRESS",
          players: {
            create: lobby.players.map((p) => ({
              userId: p.userId,
              color: p.color,
            })),
          },
        },
      });

      // Create game state
      const socketIdMap = new Map(lobby.players.map((p) => [p.userId, p.socketId]));
      engine.createMatch(
        match.id,
        lobby.code,
        lobby.players.map((p) => ({ userId: p.userId, username: p.username, color: p.color })),
        socketIdMap
      );

      // Assign roles in DB
      const gameMatch = engine.getMatch(match.id)!;
      for (const p of gameMatch.players.values()) {
        await prisma.matchPlayer.updateMany({
          where: { matchId: match.id, userId: p.userId },
          data: { role: p.role },
        });
      }

      // Emit game:started to each player (with THEIR role)
      for (const p of gameMatch.players.values()) {
        const payload = {
          matchId: match.id,
          role: p.role,
          players: [...gameMatch.players.values()].map((gp) => ({
            userId: gp.userId,
            username: gp.username,
            color: gp.color,
          })),
          spawn: { x: p.x, y: p.y },
        };
        io.to(p.socketId).emit(GAME_EVENTS.STARTED, payload);
      }

      // Emit tasks to each crewmate
      for (const p of gameMatch.players.values()) {
        if (p.role !== "CREW") continue;
        const playerTasks = [...gameMatch.tasks.values()]
          .filter((t) => t.assignedTo === p.userId)
          .map((t) => ({ id: t.id, type: t.type, room: t.room, x: t.x, y: t.y, completed: t.completed, isVisual: t.isVisual }));
        io.to(p.socketId).emit(TASK_EVENTS.TASKS_ASSIGNED, {
          tasks: playerTasks,
          total: gameMatch.taskProgress.total,
        });
      }
    } catch (dbErr) {
      console.error("[server] Failed to create match:", dbErr);
      socket.emit(LOBBY_EVENTS.ERROR, { code: "match_creation_failed", message: "Failed to start game" });
      // Revert lobby status so players can retry
      lobby.status = "LOBBY";
      io.to(lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(lobby));
    }
  });
}

function errorToMessage(code: LobbyErrorCode): string {
  const messages: Record<LobbyErrorCode, string> = {
    already_in_lobby: "You are already in a lobby",
    not_found: "Lobby not found",
    full: "Lobby is full",
    wrong_password: "Wrong password",
    not_in_lobby: "You are not in a lobby",
    color_taken: "That color is already taken",
    invalid_color: "Invalid color",
    not_host: "Only the host can start the game",
    not_enough_players: `Need at least ${4} players to start`,
    already_starting: "Game is already starting",
  };
  return messages[code];
}
