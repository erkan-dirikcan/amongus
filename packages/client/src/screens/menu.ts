import { api } from "../network/api.js";
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";

export function initMenuScreen(): void {
  const logoutBtn = document.getElementById("btn-logout")!;
  const createBtn = document.getElementById("btn-create")!;
  const joinBtn = document.getElementById("btn-join")!;
  const statsBtn = document.getElementById("btn-stats")!;
  const errorEl = document.getElementById("menu-error")!;

  statsBtn.addEventListener("click", () => {
    showScreen("stats");
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    showScreen("login");
  });

  createBtn.addEventListener("click", () => {
    const password = (document.getElementById("create-password") as HTMLInputElement).value || undefined;
    errorEl.textContent = "";
    const socket = getSocket();
    socket.emit("lobby:create", { password });
  });

  joinBtn.addEventListener("click", () => {
    const code = (document.getElementById("join-code") as HTMLInputElement).value.trim().toUpperCase();
    const password = (document.getElementById("join-password") as HTMLInputElement).value || undefined;
    if (!code) {
      errorEl.textContent = "Oda kodu gerekli";
      return;
    }
    errorEl.textContent = "";
    const socket = getSocket();
    socket.emit("lobby:join", { code, password });
  });
}
