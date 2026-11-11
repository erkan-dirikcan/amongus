import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { LobbyState } from "../types.js";
import { getCurrentUserId } from "../session.js";
import { createCrewmateSvg } from "../phaser/sprites.js";
import { COLOR_HEX } from "../constants.js";

const COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
];

export function initLobbyScreen(): void {
  const socket = getSocket();

  // Build color buttons
  const colorButtonsEl = document.getElementById("color-buttons")!;
  for (const color of COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.style.backgroundColor = COLOR_HEX[color];
    btn.dataset.color = color;
    btn.title = color.toUpperCase();
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

  const ERROR_TR: Record<string, string> = {
    already_in_lobby: "Bu hesap zaten odada! İkinci pencerede farklı bir kullanıcı adıyla giriş yapın.",
    not_found: "Oda bulunamadı! Oda kapanmış veya kod yanlış olabilir.",
    full: "Bu oda dolu!",
    wrong_password: "Oda şifresi hatalı!",
    not_in_lobby: "Bir odada değilsiniz.",
    color_taken: "Bu renk başka bir oyuncu tarafından seçilmiş.",
    invalid_color: "Geçersiz renk.",
    not_host: "Oyunu sadece oda kurucusu başlatabilir.",
    not_enough_players: "Oyunu başlatmak için en az 4 oyuncu gerekiyor.",
    already_starting: "Oyun zaten başlatılıyor...",
    validation_error: "Geçersiz oda kodu veya bilgi.",
  };

  socket.on("lobby:error", (err: { code: string; message: string }) => {
    const lobbyScreen = document.getElementById("lobby-screen");
    if (err.code === "not_found" && lobbyScreen && !lobbyScreen.hidden) {
      document.getElementById("lobby-code")!.textContent = "";
      showScreen("menu");
    }
    const msg = ERROR_TR[err.code] || err.message;
    const lobbyErrorEl = document.getElementById("lobby-error");
    const menuErrorEl = document.getElementById("menu-error");
    if (lobbyErrorEl) lobbyErrorEl.textContent = msg;
    if (menuErrorEl) menuErrorEl.textContent = msg;
    setTimeout(() => {
      if (lobbyErrorEl && lobbyErrorEl.textContent === msg) lobbyErrorEl.textContent = "";
      if (menuErrorEl && menuErrorEl.textContent === msg) menuErrorEl.textContent = "";
    }, 4500);
  });

  socket.on("connect", () => {
    const lobbyScreen = document.getElementById("lobby-screen");
    const currentCode = document.getElementById("lobby-code")?.textContent?.trim();
    if (lobbyScreen && !lobbyScreen.hidden && currentCode) {
      socket.emit("lobby:join", { code: currentCode });
    }
  });

  socket.on("connect_error", () => {
    const msg = "Sunucu ile bağlantı kurulamadı. Lütfen sayfayı yenileyip tekrar giriş yapın.";
    const menuErrorEl = document.getElementById("menu-error");
    if (menuErrorEl) menuErrorEl.textContent = msg;
  });

  // Action buttons
  document.getElementById("btn-ready")!.addEventListener("click", () => {
    socket.emit("lobby:toggleReady");
  });

  document.getElementById("btn-leave")!.addEventListener("click", () => {
    socket.emit("lobby:leave");
    document.getElementById("lobby-code")!.textContent = "";
    showScreen("menu");
  });

  document.getElementById("btn-start")!.addEventListener("click", () => {
    socket.emit("lobby:start");
  });

  document.getElementById("btn-copy-code")!.addEventListener("click", () => {
    const code = document.getElementById("lobby-code")!.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      const copyBtn = document.getElementById("btn-copy-code")!;
      copyBtn.textContent = "✓ Kopyalandı!";
      setTimeout(() => (copyBtn.textContent = "📋 Kopyala"), 1500);
    }
  });
}

function renderLobby(state: LobbyState): void {
  document.getElementById("lobby-code")!.textContent = state.code;

  const countEl = document.getElementById("lobby-count");
  if (countEl) {
    const count = state.players.length;
    const impostors = count <= 5 ? 1 : count <= 7 ? 2 : 3;
    countEl.textContent = `Oyuncular: ${count}/${state.maxPlayers} • ${impostors} Impostor (En az 4 oyuncu gerekir)`;
  }

  // Render players with Crewmate SVG avatars
  const listEl = document.getElementById("players-list")!;
  listEl.innerHTML = "";
  for (const p of state.players) {
    const row = document.createElement("div");
    row.className = "player-row";

    const avatarWrap = document.createElement("span");
    avatarWrap.innerHTML = createCrewmateSvg(COLOR_HEX[p.color] || "#888", { size: 30 });

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = p.username + (p.isHost ? " 👑" : "");

    const ready = document.createElement("span");
    ready.className = "player-ready" + (p.isReady ? " ready" : "");
    ready.textContent = p.isReady ? "✓ Hazır" : "⏳ Bekliyor";

    row.appendChild(avatarWrap);
    row.appendChild(name);
    row.appendChild(ready);
    listEl.appendChild(row);
  }

  // Update ready button text
  const currentUserId = getCurrentUserId();
  const me = state.players.find((p) => p.userId === currentUserId);
  const readyBtn = document.getElementById("btn-ready")!;
  if (me) {
    readyBtn.textContent = me.isReady ? "Hazır İptal" : "Hazır Ol";
  }

  // Show start button only for host
  const startBtn = document.getElementById("btn-start")!;
  startBtn.hidden = !me?.isHost;

  // Highlight selected color
  const buttons = document.querySelectorAll(".color-btn");
  buttons.forEach((b) => {
    const el = b as HTMLButtonElement;
    el.classList.toggle("selected", el.dataset.color === me?.color);
    el.disabled = state.players.some((p) => p.color === el.dataset.color && p.userId !== currentUserId);
  });
}
