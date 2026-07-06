import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import type { GameStartedPayload } from "../types.js";

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", (payload: GameStartedPayload) => {
    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    roleEl.textContent = payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.8)" : "rgba(30,100,200,0.8)";
    startPhaserGame(payload);
  });

  socket.on("game:ended", () => {
    stopPhaserGame();
    showScreen("menu");
  });
}
