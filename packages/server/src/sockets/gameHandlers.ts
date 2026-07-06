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
    const { dx: rawDx, dy: rawDy, seq } = payload as { dx: number; dy: number; seq: number };

    // Throttle: ignore inputs more frequent than every 30ms (allows ~33Hz, prevents flooding)
    const now = Date.now();
    const lastInput = (socket as any)._lastGameInput || 0;
    if (now - lastInput < 30) return;
    (socket as any)._lastGameInput = now;

    // Clamp to unit range — prevents teleport exploit (C1)
    const dx = Math.max(-1, Math.min(1, rawDx));
    const dy = Math.max(-1, Math.min(1, rawDy));

    // Find which match this user is in
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    engine.setInput(match.matchId, user.userId, dx, dy, seq);
  });
}
