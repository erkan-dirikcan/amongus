import { CAMERA_ROOMS, MONITOR_POSITIONS } from "@amongus/shared";
import type { MonitorData, MonitorType } from "@amongus/shared";
import type { GameState } from "./types.js";

/** Room rectangles (tile coords, inclusive) — must match scripts/generate-map.mjs. */
export const ROOM_RECTS: { name: string; x1: number; y1: number; x2: number; y2: number }[] = [
  { name: "cafeteria", x1: 20, y1: 20, x2: 29, y2: 29 },
  { name: "medbay", x1: 20, y1: 12, x2: 29, y2: 17 },
  { name: "weapons", x1: 35, y1: 18, x2: 42, y2: 23 },
  { name: "navigation", x1: 38, y1: 28, x2: 43, y2: 35 },
  { name: "o2", x1: 35, y1: 40, x2: 40, y2: 45 },
  { name: "reactor", x1: 6, y1: 40, x2: 13, y2: 45 },
  { name: "electrical", x1: 5, y1: 28, x2: 12, y2: 35 },
  { name: "storage", x1: 5, y1: 18, x2: 12, y2: 23 },
  { name: "admin", x1: 22, y1: 40, x2: 29, y2: 45 },
];

/** Which room contains this tile position (undefined = corridor/no room). */
export function roomAt(x: number, y: number): string | undefined {
  for (const r of ROOM_RECTS) {
    if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return r.name;
  }
  return undefined;
}

export function findMonitorAt(x: number, y: number, maxDist: number): { id: string; type: MonitorType } | undefined {
  let nearest: { id: string; type: MonitorType } | undefined;
  let nearestDist = Infinity;
  for (const m of MONITOR_POSITIONS) {
    const dist = Math.sqrt((m.x - x) ** 2 + (m.y - y) ** 2);
    if (dist <= maxDist && dist < nearestDist) {
      nearest = { id: m.id, type: m.type };
      nearestDist = dist;
    }
  }
  return nearest;
}

/**
 * Build a monitor snapshot for the requesting player.
 * Comms sabotage blinds every monitor ({ error: "comms" }).
 */
export function getMonitorSnapshot(match: GameState, type: MonitorType, requesterId: string): MonitorData | { error: "comms" } {
  if (match.sabotage?.type === "comms") return { error: "comms" };

  if (type === "cameras") {
    return {
      type: "cameras",
      rooms: CAMERA_ROOMS.map((room) => {
        const players = [...match.players.values()].filter(
          (p) => p.userId !== requesterId && p.isAlive && !p.inVent && roomAt(p.x, p.y) === room
        );
        const corpses = match.corpses.filter((c) => roomAt(c.x, c.y) === room);
        return {
          room,
          players: players.map((p) => ({ color: p.color })),
          corpses: corpses.map((c) => ({ color: c.victimColor })),
        };
      }),
    };
  }

  if (type === "admin") {
    return {
      type: "admin",
      rooms: ROOM_RECTS.map((r) => {
        // Alive players not in vent + corpses (Among Us: corpses count as bodies present)
        const alive = [...match.players.values()].filter(
          (p) => p.isAlive && !p.inVent && roomAt(p.x, p.y) === r.name
        ).length;
        const corpses = match.corpses.filter((c) => roomAt(c.x, c.y) === r.name).length;
        return { room: r.name, count: alive + corpses };
      }),
    };
  }

  // vitals
  const now = Date.now();
  return {
    type: "vitals",
    players: [...match.players.values()].map((p) => ({
      userId: p.userId,
      username: p.username,
      isAlive: p.isAlive,
      deadAgoSec: p.isAlive ? undefined : p.diedAt ? Math.max(0, Math.floor((now - p.diedAt) / 1000)) : undefined,
    })),
  };
}
