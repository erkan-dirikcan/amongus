import { api } from "./network/api.js";
import { initLoginScreen } from "./screens/login.js";
import { initMenuScreen } from "./screens/menu.js";
import { initLobbyScreen } from "./screens/lobby.js";
import { initGameScreen } from "./screens/game.js";
import { initMeetingScreen } from "./screens/meeting.js";

export type Screen = "login" | "menu" | "lobby" | "game" | "meeting";

export function showScreen(screen: Screen): void {
  for (const s of ["login", "menu", "lobby", "game", "meeting"]) {
    const el = document.getElementById(`${s}-screen`);
    if (el) el.hidden = s !== screen;
  }
}

async function bootstrap(): Promise<void> {
  initLoginScreen();
  initMenuScreen();
  initLobbyScreen();
  initGameScreen();
  // initMeetingScreen is async (fetches userId); fire-and-forget so it
  // doesn't block the rest of bootstrap. It registers socket handlers.
  void initMeetingScreen();

  // Check if already logged in
  try {
    const { user } = await api.me();
    showScreen("menu");
    document.getElementById("menu-username")!.textContent = user.username;
  } catch {
    showScreen("login");
  }
}

bootstrap();
