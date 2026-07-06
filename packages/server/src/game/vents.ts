import type { VentInfo } from "@amongus/shared";

export const VENT_POSITIONS: VentInfo[] = [
  { id: "vent-electrical", x: 8, y: 31, room: "electrical" },
  { id: "vent-cafeteria", x: 24, y: 24, room: "cafeteria" },
  { id: "vent-reactor", x: 9, y: 42, room: "reactor" },
  { id: "vent-o2", x: 37, y: 42, room: "o2" },
  { id: "vent-navigation", x: 40, y: 30, room: "navigation" },
];

export function findVentById(id: string): VentInfo | undefined {
  return VENT_POSITIONS.find((v) => v.id === id);
}

export function findNearestVent(x: number, y: number, maxDist: number): VentInfo | undefined {
  let nearest: VentInfo | undefined;
  let nearestDist = Infinity;
  for (const v of VENT_POSITIONS) {
    const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
    if (dist <= maxDist && dist < nearestDist) {
      nearest = v;
      nearestDist = dist;
    }
  }
  return nearest;
}
