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
