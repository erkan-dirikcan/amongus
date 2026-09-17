import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { LobbyState } from "../types.js";
import { getCurrentUserId } from "../session.js";

// Local copy of colors — avoids cross-package import complexity in the browser bundle.
// These MUST match packages/shared/src/constants.ts LOBBY_COLORS exactly.
const COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
];

const COLOR_HEX: Record<string, string> = {
  red: "#e53935", blue: "#1e88e5", green: "#43a047", pink: "#ec407a",
  orange: "#fb8c00", yellow: "#fdd835", black: "#212121", white: "#fafafa",
  purple: "#8e24aa", brown: "#795548", cyan: "#00acc1", lime: "#c0ca33",
};

export function initLobbyScreen(): void {
  const socket = getSocket();

  // Build color buttons
  const colorButtonsEl = document.getElementById("color-buttons")!;
  for (const color of COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.style.backgroundColor = COLOR_HEX[color];
    btn.dataset.color = color;
    btn.addEventListener("click", () => {
      socket.emit("lobby:setColor", { color });
    });
    colorButtonsEl.appendChild(btn);
  }

  socket.on("lobby:state", (state: LobbyState) => {
    renderLobby(state);
    showScreen("lobby");
  });

  socket.on("lobby:updated", (state: LobbyState) => {
    renderLobby(state);
  });

  socket.on("lobby:error", (err: { code: string; message: string }) => {
    const errorEl = document.getElementById("lobby-error")!;
    errorEl.textContent = err.message;
    setTimeout(() => (errorEl.textContent = ""), 3000);
  });

  // Action buttons
  document.getElementById("btn-ready")!.addEventListener("click", () => {
    socket.emit("lobby:toggleReady");
  });

  document.getElementById("btn-leave")!.addEventListener("click", () => {
    socket.emit("lobby:leave");
    showScreen("menu");
  });

  document.getElementById("btn-start")!.addEventListener("click", () => {
    socket.emit("lobby:start");
  });

  document.getElementById("btn-copy-code")!.addEventListener("click", () => {
    const code = document.getElementById("lobby-code")!.textContent;
    if (code) navigator.clipboard.writeText(code);
  });
}

function renderLobby(state: LobbyState): void {
  document.getElementById("lobby-code")!.textContent = state.code;

  // Render players
  const listEl = document.getElementById("players-list")!;
  listEl.innerHTML = "";
  for (const p of state.players) {
    const row = document.createElement("div");
    row.className = "player-row";

    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.background = COLOR_HEX[p.color] || "#888";

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = p.username + (p.isHost ? " 👑" : "");

    const ready = document.createElement("span");
    ready.className = "player-ready";
    ready.textContent = p.isReady ? "✓ Hazır" : "⏳ Bekliyor";

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(ready);
    listEl.appendChild(row);
  }

  // Update ready button text
  const currentUserId = getCurrentUserId();
  const me = state.players.find((p) => p.userId === currentUserId);
  const readyBtn = document.getElementById("btn-ready")!;
  if (me) {
    readyBtn.textContent = me.isReady ? "Hazır Olmadan" : "Hazır Ol";
  }

  // Show start button only for host
  const startBtn = document.getElementById("btn-start")!;
  startBtn.hidden = !(me?.isHost);

  // Highlight selected color
  const buttons = document.querySelectorAll(".color-btn");
  buttons.forEach((b) => {
    const el = b as HTMLButtonElement;
    el.classList.toggle("selected", el.dataset.color === me?.color);
    el.disabled = state.players.some((p) => p.color === el.dataset.color && p.userId !== currentUserId);
  });
}
