// Client-side game constants (kept in sync with @amongus/shared — the client
// bundle does not depend on the shared package; types live in types.ts).

export type MonitorType = "cameras" | "admin" | "vitals";

/** Interactable monitor tiles on the map. */
export const MONITOR_POSITIONS: { id: string; type: MonitorType; room: string; x: number; y: number }[] = [
  { id: "monitor-cameras", type: "cameras", room: "cafeteria", x: 25, y: 20 },
  { id: "monitor-admin", type: "admin", room: "admin", x: 25, y: 44 },
  { id: "monitor-vitals", type: "vitals", room: "medbay", x: 27, y: 15 },
];

/** Interaction distance for monitor tiles (tiles). */
export const MONITOR_INTERACT_DISTANCE = 1.5;

/** Polling interval while a monitor panel is open (ms). */
export const MONITOR_QUERY_INTERVAL_MS = 1000;

/** Duration of the Medbay visual scan animation (ms). */
export const MEDBAY_SCAN_DURATION_MS = 15000;

/** Room rectangles (tile coords) — mirrors packages/server/scripts/generate-map.mjs. */
export const ROOMS: { name: string; label: string; x: number; y: number; w: number; h: number }[] = [
  { name: "cafeteria", label: "KAFETERYA", x: 20, y: 20, w: 10, h: 10 },
  { name: "medbay", label: "MEDBAY", x: 20, y: 12, w: 10, h: 6 },
  { name: "weapons", label: "SİLAHLAR", x: 35, y: 18, w: 8, h: 6 },
  { name: "navigation", label: "NAVİGASYON", x: 38, y: 28, w: 6, h: 8 },
  { name: "o2", label: "O2", x: 35, y: 40, w: 6, h: 6 },
  { name: "reactor", label: "REAKTÖR", x: 6, y: 40, w: 8, h: 6 },
  { name: "electrical", label: "ELEKTRİK", x: 5, y: 28, w: 8, h: 8 },
  { name: "storage", label: "DEPO", x: 5, y: 18, w: 8, h: 6 },
  { name: "admin", label: "ADMİN", x: 22, y: 40, w: 8, h: 6 },
];

/** Vent tiles — mirrors packages/server/src/game/vents.ts. */
export const VENT_POSITIONS: { id: string; room: string; x: number; y: number }[] = [
  { id: "vent-electrical", room: "electrical", x: 8, y: 31 },
  { id: "vent-cafeteria", room: "cafeteria", x: 24, y: 24 },
  { id: "vent-reactor", room: "reactor", x: 9, y: 42 },
  { id: "vent-o2", room: "o2", x: 37, y: 42 },
  { id: "vent-navigation", room: "navigation", x: 40, y: 30 },
];

/** Interaction distance for vents (tiles). */
export const VENT_INTERACT_DISTANCE = 1.5;

/** Player colours (hex numbers for Phaser). Must match shared LOBBY_COLORS. */
export const PLAYER_COLORS: Record<string, number> = {
  red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, pink: 0xec407a,
  orange: 0xfb8c00, yellow: 0xfdd835, black: 0x3a3a3a, white: 0xfafafa,
  purple: 0x8e24aa, brown: 0x795548, cyan: 0x00acc1, lime: 0xc0ca33,
};

/** Emergency button on the cafeteria table — mirrors server engine.ts. */
export const EMERGENCY_BUTTON = { x: 25.5, y: 25.5 };
export const EMERGENCY_BUTTON_DISTANCE = 2.5;
