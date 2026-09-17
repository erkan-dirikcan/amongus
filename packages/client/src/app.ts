import { api } from "./network/api.js";
import { connectSocket } from "./network/socket.js";
import { setCurrentUser } from "./session.js";
import { audio } from "./audio/manager.js";
import { initLoginScreen } from "./screens/login.js";
import { initMenuScreen } from "./screens/menu.js";
import { initLobbyScreen } from "./screens/lobby.js";
import { initGameScreen } from "./screens/game.js";
import { initMeetingScreen } from "./screens/meeting.js";
import { initStatsScreen, loadStats } from "./screens/stats.js";

export type Screen = "login" | "menu" | "lobby" | "game" | "meeting" | "stats";

export function showScreen(screen: Screen): void {
  for (const s of ["login", "menu", "lobby", "game", "meeting", "stats"]) {
    const el = document.getElementById(`${s}-screen`);
    if (el) el.hidden = s !== screen;
  }
  if (screen === "stats") {
    void loadStats();
  }
}

async function bootstrap(): Promise<void> {
  initLoginScreen();
  initMenuScreen();
  initLobbyScreen();
  initGameScreen();
  initMeetingScreen();
  void initStatsScreen();

  // Subtle click sound on every button (respects mute, resumes AudioContext)
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) {
      audio.play("click");
    }
  });

  // Check if already logged in
  try {
    const { user } = await api.me();
    setCurrentUser(user);
    connectSocket();
    showScreen("menu");
    document.getElementById("menu-username")!.textContent = user.username;
  } catch {
    showScreen("login");
  }
}

bootstrap();
