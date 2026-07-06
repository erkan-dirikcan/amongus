import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "node:http";
import type { ExtendedIo, ExtendedSocket } from "./types.js";
import { AUTH_COOKIE_NAME } from "@amongus/shared";
import { verifyToken } from "../auth/jwt.js";
import type { LobbyManager } from "../lobby/manager.js";
import { registerLobbyHandlers } from "./lobbyHandlers.js";
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

export function setupSocketServer(httpServer: HTTPServer, lobbyManager: LobbyManager): ExtendedIo {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173", "http://localhost:3000"],
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
    registerLobbyHandlers(io, socket, lobbyManager);

    socket.on("disconnect", () => {
      const result = lobbyManager.leaveLobbyBySocket(socket.id);
      if (result.lobby) {
        const state = lobbyManager.toLobbyState(result.lobby);
        io.to(result.lobby.code).emit("lobby:updated", state);
      }
    });
  });

  return io;
}
