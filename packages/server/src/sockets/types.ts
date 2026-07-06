import type { Server as SocketIOServer, Socket } from "socket.io";
import type { JwtPayload } from "../auth/jwt.js";

export interface ExtendedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

export interface ExtendedIo extends SocketIOServer {
  // Extended for typing; same as base for now
}
