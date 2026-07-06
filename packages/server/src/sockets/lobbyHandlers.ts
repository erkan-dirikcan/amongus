import type { Server as SocketIOServer } from "socket.io";
import type { ExtendedSocket, ExtendedIo } from "./types.js";
import type { LobbyManager, LobbyErrorCode } from "../lobby/manager.js";
import { LOBBY_EVENTS, lobbyCreateSchema, lobbyJoinSchema, lobbySetColorSchema } from "@amongus/shared";

export function registerLobbyHandlers(
  io: ExtendedIo,
  socket: ExtendedSocket,
  mgr: LobbyManager
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

  socket.on(LOBBY_EVENTS.START, () => {
    const result = mgr.startLobby(user.userId);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
      io.to(result.lobby.code).emit(LOBBY_EVENTS.STARTED, { code: result.lobby.code });
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
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
