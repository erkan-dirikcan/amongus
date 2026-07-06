import type { ExtendedIo, ExtendedSocket } from "./types.js";
import type { GameEngine } from "../game/engine.js";
import { GAME_EVENTS } from "@amongus/shared";

export function registerGameHandlers(
  _io: ExtendedIo,
  socket: ExtendedSocket,
  engine: GameEngine
): void {
  const user = socket.data.user;

  socket.on(GAME_EVENTS.INPUT, (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as any).dx !== "number" ||
      typeof (payload as any).dy !== "number" ||
      typeof (payload as any).seq !== "number"
    ) {
      return; // ignore malformed
    }
    const { dx, dy, seq } = payload as { dx: number; dy: number; seq: number };
    // Find which match this user is in
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    engine.setInput(match.matchId, user.userId, dx, dy, seq);
  });
}
