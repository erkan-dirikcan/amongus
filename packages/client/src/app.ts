import { api } from "./network/api.js";
import { initLoginScreen } from "./screens/login.js";
import { initMenuScreen } from "./screens/menu.js";
import { initLobbyScreen } from "./screens/lobby.js";

export type Screen = "login" | "menu" | "lobby";

export function showScreen(screen: Screen): void {
  for (const s of ["login", "menu", "lobby"]) {
    const el = document.getElementById(`${s}-screen`);
    if (el) el.hidden = s !== screen;
  }
}

async function bootstrap(): Promise<void> {
  initLoginScreen();
  initMenuScreen();
  initLobbyScreen();

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
