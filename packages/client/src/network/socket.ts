import { io, type Socket } from "socket.io-client";

// Single shared socket. Screens register their handlers on this instance at
// bootstrap, so it is created lazily but NEVER re-created — only
// connected/disconnected as the auth session comes and goes.
//
// autoConnect is off on purpose: the server's socket middleware rejects any
// connection without a valid auth cookie, and socket.io-client does not retry
// after a middleware rejection (socket.active === false). Connecting before
// login therefore left the socket permanently dead and every lobby emit
// silently buffered.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ withCredentials: true, autoConnect: false });
  }
  return socket;
}

/** Open the socket once the auth cookie is in place (after login / on resume). */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

/** Close the socket on logout; the instance and its handlers are kept. */
export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
