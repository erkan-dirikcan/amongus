import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "node:http";
import type { ExtendedIo, ExtendedSocket } from "./types.js";
import { AUTH_COOKIE_NAME, GAME_EVENTS, MEETING_EVENTS } from "@amongus/shared";
import { verifyToken } from "../auth/jwt.js";
import type { LobbyManager } from "../lobby/manager.js";
import { registerLobbyHandlers } from "./lobbyHandlers.js";
import { registerGameHandlers, handleGameEnd, sendGameState } from "./gameHandlers.js";
import { GameEngine } from "../game/engine.js";
import cookieParser from "cookie-parser";

/**
 * Parse cookies from a raw Cookie header string (Socket.io doesn't use Express middleware).
 */
function parseCookies(rawCookie?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!rawCookie) return cookies;
  for (const part of rawCookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(v.join("="));
  }
  return cookies;
}

export function setupSocketServer(
  httpServer: HTTPServer,
  lobbyManager: LobbyManager,
  gameEngine: GameEngine
): ExtendedIo {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? true : ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    },
  }) as ExtendedIo;

  // Auth middleware: verify JWT from cookie on every connection
  io.use((socket: ExtendedSocket, next) => {
    const rawCookie = socket.request.headers.cookie;
    const cookies = parseCookies(rawCookie);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) {
      return next(new Error("unauthorized"));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error("invalid_token"));
    }
    socket.data.user = payload;
    next();
  });

  io.on("connection", (socket: ExtendedSocket) => {
    registerLobbyHandlers(io, socket, lobbyManager, gameEngine);
    registerGameHandlers(io, socket, gameEngine, lobbyManager);

    // Rejoin: the user is still part of a running match (page refresh, brief
    // network drop) — attach this socket and replay the game state to it.
    const running = gameEngine.findMatchByUser(socket.data.user.userId);
    if (running && running.status === "IN_PROGRESS") {
      gameEngine.reattach(running.matchId, socket.data.user.userId, socket.id);
      socket.join(running.code);
      sendGameState(io, gameEngine, running.matchId, socket.data.user.userId);
    }

    socket.on("disconnect", () => {
      const result = lobbyManager.leaveLobbyBySocket(socket.id);
      if (result.lobby) {
        const state = lobbyManager.toLobbyState(result.lobby);
        io.to(result.lobby.code).emit("lobby:updated", state);
      }
      // Game: freeze the player and start their grace timer. The tick loop
      // kills them if they do not come back in time and removes the match once
      // nobody is left — a match must never linger IN_PROGRESS, or
      // findMatchByUser() would route its players' inputs there in later games.
      const gameMatch = gameEngine.findMatchBySocket(socket.id);
      if (gameMatch) {
        gameEngine.markDisconnected(gameMatch.matchId, socket.data.user.userId);
      }
    });
  });

  // Start tick loop (20Hz)
  const TICK_MS = 50;
  const tickInterval = setInterval(() => {
    for (const matchId of gameEngine.getActiveMatchIds()) {
      // Players who dropped and never came back
      const expired = gameEngine.expireDisconnected(matchId);
      if (expired.abandoned) {
        gameEngine.removeMatch(matchId);
        continue;
      }
      if (expired.killed.length) {
        const winner = gameEngine.checkWin(matchId);
        if (winner) {
          handleGameEnd(io, gameEngine, matchId, winner, lobbyManager);
          continue;
        }
      }
      // Check sabotage timeout
      const sabWinner = gameEngine.checkSabotageWin(matchId);
      if (sabWinner) {
        handleGameEnd(io, gameEngine, matchId, sabWinner, lobbyManager);
        continue;
      }
      // Check meeting end BEFORE normal tick — if meeting just ended, emit and skip tick.
      if (gameEngine.shouldEndMeeting(matchId)) {
        const result = gameEngine.endMeeting(matchId);
        if (result) {
          const match = gameEngine.getMatch(matchId);
          if (match) {
            io.to(match.code).emit(MEETING_EVENTS.MEETING_ENDED, {
              ejectedId: result.ejectedId,
              ejectedRole: result.ejectedRole,
              wasTie: result.wasTie,
              votes: result.votes ?? {},
            });
            const winner = gameEngine.checkWin(matchId);
            if (winner) {
              handleGameEnd(io, gameEngine, matchId, winner, lobbyManager);
            }
          }
        }
        continue; // skip tick during meeting transition
      }
      // Normal tick
      const payload = gameEngine.tick(matchId);
      const match = gameEngine.getMatch(matchId);
      if (match) {
        io.to(match.code).emit(GAME_EVENTS.TICK, payload);
      }
    }
  }, TICK_MS);

  // Stop the tick loop when the server shuts down (graceful exit / test teardown)
  httpServer.on("close", () => clearInterval(tickInterval));

  return io;
}
