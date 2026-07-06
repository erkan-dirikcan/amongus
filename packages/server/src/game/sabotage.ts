import type { SabotageType } from "@amongus/shared";
import { REACTOR_TIMEOUT_MS, O2_TIMEOUT_MS } from "@amongus/shared";
import type { SabotageState } from "./types.js";

export function createSabotage(type: SabotageType): SabotageState {
  const now = Date.now();
  return {
    type,
    active: true,
    startedAt: now,
    expiresAt: type === "reactor" ? now + REACTOR_TIMEOUT_MS : type === "o2" ? now + O2_TIMEOUT_MS : undefined,
    holders: new Set(),
    repairProgress: 0,
  };
}

export function checkSabotageTimeout(sabotage: SabotageState): boolean {
  if (!sabotage.expiresAt) return false;
  return Date.now() >= sabotage.expiresAt;
}
