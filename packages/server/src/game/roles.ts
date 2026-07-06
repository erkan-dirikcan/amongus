import { getImpostorCount, type PlayerRole } from "@amongus/shared";

/**
 * Assign roles to players using Fisher-Yates shuffle.
 * Returns a Map of userId → role.
 */
export function assignRoles(playerIds: string[]): Map<string, PlayerRole> {
  const shuffled = [...playerIds];

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const impostorCount = getImpostorCount(playerIds.length);
  const roles = new Map<string, PlayerRole>();

  for (let i = 0; i < shuffled.length; i++) {
    roles.set(shuffled[i], i < impostorCount ? "IMPOSTOR" : "CREW");
  }

  return roles;
}
