import type { ExtendedIo, ExtendedSocket } from "./types.js";
import type { GameEngine } from "../game/engine.js";
import { TASK_EVENTS, GAME_EVENTS, MEETING_EVENTS } from "@amongus/shared";
import { prisma } from "../db/prisma.js";

export function registerGameHandlers(
  io: ExtendedIo,
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

  socket.on(TASK_EVENTS.TASK_COMPLETE, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || typeof (payload as any).taskId !== "string") return;
    const { taskId } = payload as { taskId: string };
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;

    const result = engine.completeTask(match.matchId, user.userId, taskId);
    if (result.success) {
      io.to(match.code).emit(TASK_EVENTS.TASK_UPDATE, { ...result.taskProgress!, taskId });
      const winner = engine.checkWin(match.matchId);
      if (winner) {
        handleGameEnd(io, engine, match.matchId, winner);
      }
    } else {
      socket.emit(TASK_EVENTS.TASK_UPDATE, engine.getMatch(match.matchId)!.taskProgress);
    }
  });

  socket.on(TASK_EVENTS.KILL, () => {
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.kill(match.matchId, user.userId);
    if (result.success) {
      const victim = match.players.get(result.victimId!)!;
      io.to(match.code).emit(TASK_EVENTS.PLAYER_KILLED, { victimId: result.victimId, x: victim.x, y: victim.y });
      io.to(match.code).emit(TASK_EVENTS.CORPSE_ADDED, {
        corpseId: result.corpse!.id,
        x: result.corpse!.x,
        y: result.corpse!.y,
        color: result.corpse!.victimColor,
      });
      socket.emit(TASK_EVENTS.KILL_RESULT, { success: true, cooldownUntil: result.cooldownUntil! });
      const winner = engine.checkWin(match.matchId);
      if (winner) {
        handleGameEnd(io, engine, match.matchId, winner);
      }
    } else {
      socket.emit(TASK_EVENTS.KILL_RESULT, {
        success: false,
        cooldownUntil: 0,
        message: result.message,
      });
    }
  });

  socket.on(TASK_EVENTS.REPORT, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || typeof (payload as any).corpseId !== "string") return;
    const { corpseId } = payload as { corpseId: string };
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.report(match.matchId, user.userId, corpseId);
    if (result.success && result.meetingStarted) {
      emitMeetingStarted(io, match.matchId, "report", user.userId);
    }
    socket.emit(TASK_EVENTS.REPORT_RESULT, result);
  });

  socket.on(MEETING_EVENTS.VOTE, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return;
    const target = (payload as any).targetId;
    if (typeof target !== "string") return;
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.vote(match.matchId, user.userId, target);
    if (result.success) {
      io.to(match.code).emit(MEETING_EVENTS.VOTE_UPDATE, { voted: engine.getMeetingVotes(match.matchId) });
    }
  });

  socket.on(MEETING_EVENTS.EMERGENCY, () => {
    const match = engine.findMatchByUser(user.userId);
    if (!match || !engine.canUseEmergency(match.matchId, user.userId)) return;
    engine.useEmergency(match.matchId, user.userId);
    engine.startMeeting(match.matchId, "emergency", user.userId);
    emitMeetingStarted(io, match.matchId, "emergency", user.userId);
  });

  socket.on(MEETING_EVENTS.SEND_CHAT, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return;
    const message = (payload as any).message;
    if (typeof message !== "string" || message.length === 0 || message.length > 200) return;
    const match = engine.findMatchByUser(user.userId);
    if (!match || !engine.isInMeeting(match.matchId)) return;
    const player = match.players.get(user.userId);
    if (!player || !player.isAlive) return;
    io.to(match.code).emit(MEETING_EVENTS.CHAT_MESSAGE, {
      userId: user.userId,
      username: player.username,
      message,
    });
  });

  // Helper: emit meetingStarted payload to all clients in the match room.
  // Defined as a closure inside registerGameHandlers so it has access to `engine`.
  function emitMeetingStarted(
    io: ExtendedIo,
    matchId: string,
    reason: "report" | "emergency",
    reporterId: string
  ): void {
    const match = engine.getMatch(matchId);
    if (!match) return;
    const payload = {
      reason,
      reporterId,
      reporterName: match.players.get(reporterId)?.username || "",
      duration: match.meetingState?.durationMs || 90000,
      players: [...match.players.values()].map((p) => ({
        userId: p.userId,
        username: p.username,
        color: p.color,
        isAlive: p.isAlive,
      })),
      victimId: match.meetingState?.victimId,
    };
    io.to(match.code).emit(MEETING_EVENTS.MEETING_STARTED, payload);
  }
}

export async function handleGameEnd(io: ExtendedIo, engine: GameEngine, matchId: string, winner: "CREW" | "IMPOSTOR"): Promise<void> {
  const match = engine.getMatch(matchId);
  if (!match) return;
  match.status = "ENDED";

  // Update DB: Match record
  try {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "ENDED", endedAt: new Date(), winner },
    });

    // Update UserStats for each player
    for (const player of match.players.values()) {
      const isWin = (winner === "CREW" && player.role === "CREW") || (winner === "IMPOSTOR" && player.role === "IMPOSTOR");
      await prisma.userStats.upsert({
        where: { userId: player.userId },
        create: {
          userId: player.userId,
          gamesPlayed: 1,
          wins: isWin ? 1 : 0,
          losses: isWin ? 0 : 1,
        },
        update: {
          gamesPlayed: { increment: 1 },
          wins: { increment: isWin ? 1 : 0 },
          losses: { increment: isWin ? 0 : 1 },
        },
      });
    }
  } catch (dbErr) {
    console.error("[server] Failed to update match stats:", dbErr);
    // Non-fatal — game still ends, just stats may be incomplete
  }

  io.to(match.code).emit(GAME_EVENTS.ENDED, { winner });
  engine.removeMatch(matchId);
}
