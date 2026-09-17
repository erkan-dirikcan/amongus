import type { AuthUser } from "./types.js";

// Current authenticated user, set whenever a session is established (login,
// register, or resumed via /api/auth/me) and cleared on logout. Screens read
// it at use-time instead of caching it at bootstrap, since bootstrap runs
// before the user has logged in.
let currentUser: AuthUser | null = null;

export function setCurrentUser(user: AuthUser | null): void {
  currentUser = user;
}

export function getCurrentUserId(): string {
  return currentUser?.id ?? "";
}
