import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import { audio } from "../audio/manager.js";
import { MONITOR_QUERY_INTERVAL_MS, ROOMS, SABOTAGE_LOCATIONS, COLOR_HEX } from "../constants.js";
import type { MonitorType } from "../constants.js";
import type { GameStartedPayload, TaskClient, GameEndedPlayer } from "../types.js";
import { getCurrentUserId } from "../session.js";
import { createCrewmateSvg } from "../phaser/sprites.js";
import { closeMinigame } from "../minigames/wire.js";

const ROOM_LABELS: Record<string, string> = {
  cafeteria: "Kafeterya",
  medbay: "Medbay",
  weapons: "Silahlar",
  navigation: "Navigasyon",
  o2: "O2",
  reactor: "Reaktör",
  electrical: "Elektrik",
  storage: "Depo",
  admin: "Yönetim",
};

const TASK_LABELS: Record<string, string> = {
  wire: "Kabloları Bağla",
  download: "Veri İndir",
  cardSwipe: "Kart Okut",
  asteroids: "Asteroidleri Vur",
  fuel: "Yakıt Doldur",
  medbayScan: "Biyometrik Tarama",
};

// Active monitor & map polling state
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let openMonitorType: MonitorType | null = null;
let mapAnimInterval: ReturnType<typeof setInterval> | null = null;

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", (payload: GameStartedPayload) => {
    window.__gameCorpses = payload.corpses ?? [];
    window.__gameSabotage = undefined;
    const myUserId = getCurrentUserId();
    const fullPayload = myUserId ? { ...payload, myUserId } : payload;

    if (payload.role === "IMPOSTOR") {
      window.__gameTasks = [];
      renderTaskChecklist();
    }

    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    const aliveSuffix = payload.isAlive === false ? " (👻 HAYALET)" : "";
    roleEl.textContent = (payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE") + aliveSuffix;
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.85)" : "rgba(30,100,200,0.85)";
    updateSoundButton();
    audio.startAmbient();
    startPhaserGame(fullPayload);

    // Show dramatic Role Reveal banner on fresh start (no corpses yet)
    if (!payload.corpses || payload.corpses.length === 0) {
      showRoleReveal(fullPayload);
    }
  });

  socket.on("game:tasksAssigned", (payload: { tasks: TaskClient[]; total: number }) => {
    window.__gameTasks = payload.tasks;
    window.__gameTaskTotal = payload.total;
    updateTaskProgress(0, payload.total);
    renderTaskChecklist();
  });

  socket.on("game:taskUpdate", (payload: { completed: number; total: number; taskId?: string }) => {
    updateTaskProgress(payload.completed, payload.total);
    if (payload.taskId) {
      const isMine = window.__gameTasks?.some((t) => t.id === payload.taskId) ?? false;
      if (window.__gameTasks) {
        const task = window.__gameTasks.find((t) => t.id === payload.taskId);
        if (task) task.completed = true;
      }
      renderTaskChecklist();
      window.dispatchEvent(new CustomEvent("game:taskCompleted", { detail: { taskId: payload.taskId } }));
      if (isMine) audio.play("taskComplete");
    }
  });

  socket.on("game:corpseAdded", (payload: { corpseId: string; x: number; y: number; color: string }) => {
    window.dispatchEvent(new CustomEvent("game:corpse", { detail: payload }));
  });

  socket.on("game:killResult", (payload: { success: boolean; cooldownUntil: number; message?: string }) => {
    if (payload.success) audio.play("kill");
    window.dispatchEvent(new CustomEvent("game:killResult", { detail: payload }));
  });

  socket.on("game:reportResult", (payload: { success: boolean; message: string }) => {
    if (payload.success) audio.play("report");
    window.dispatchEvent(new CustomEvent("game:reportResult", { detail: payload }));
  });

  socket.on("game:meetingStarted", () => {
    closeMonitorPanel();
    closeMapOverlay();
    closeMinigame();
    audio.play("alarm");
    audio.setMeetingTempo(true);
  });

  socket.on("game:meetingEnded", (payload: { ejectedId: string | null }) => {
    audio.setMeetingTempo(false);
    if (payload.ejectedId) audio.play("eject");
  });

  socket.on("game:ended", (payload: { winner: "CREW" | "IMPOSTOR"; players?: GameEndedPlayer[] }) => {
    stopPhaserGame();
    closeMonitorPanel();
    closeMapOverlay();
    closeMinigame();
    audio.stopAmbient();
    audio.setMeetingTempo(false);
    showGameOver(payload.winner, payload.players);
  });

  socket.on("game:ventState", (payload: any) => {
    audio.play("vent");
    window.dispatchEvent(new CustomEvent("game:ventState", { detail: payload }));
  });

  socket.on("game:sabotageStarted", (payload: any) => {
    window.__gameSabotage = payload;
    audio.play("sabotageAlarm");
    window.dispatchEvent(new CustomEvent("game:sabotageStarted", { detail: payload }));
  });

  socket.on("game:sabotageFixed", (payload: any) => {
    window.__gameSabotage = undefined;
    window.dispatchEvent(new CustomEvent("game:sabotageFixed", { detail: payload }));
  });

  socket.on("game:monitorResult", (payload: any) => {
    if (openMonitorType && payload.type === openMonitorType) {
      renderMonitorPanel(payload);
    }
  });

  socket.on("game:visualTaskStarted", (payload: any) => {
    window.dispatchEvent(new CustomEvent("game:visualTaskStarted", { detail: payload }));
  });

  // Minigame close button
  const mgClose = document.getElementById("minigame-close");
  if (mgClose) {
    mgClose.addEventListener("click", () => closeMinigame());
  }

  // GameScene asks us to open/close monitor panels
  window.addEventListener("game:monitorOpen", (e) => {
    openMonitorPanel((e as CustomEvent).detail.type as MonitorType);
  });
  window.addEventListener("game:monitorClose", () => {
    closeMonitorPanel();
  });
  document.getElementById("monitor-close")!.addEventListener("click", () => {
    closeMonitorPanel();
  });

  // Map overlay controls
  document.getElementById("map-btn")?.addEventListener("click", () => toggleMapOverlay());
  document.getElementById("map-close")?.addEventListener("click", () => closeMapOverlay());
  window.addEventListener("game:toggleMap", () => toggleMapOverlay());

  // HUD sound toggle (persistent mute)
  const soundBtn = document.getElementById("sound-btn")!;
  soundBtn.addEventListener("click", () => {
    const muted = audio.toggleMute();
    soundBtn.textContent = muted ? "🔇" : "🔊";
    if (!muted) audio.play("click");
  });
}

function showRoleReveal(payload: GameStartedPayload): void {
  const el = document.getElementById("role-reveal");
  const titleEl = document.getElementById("role-reveal-title");
  const subEl = document.getElementById("role-reveal-sub");
  const avatarsEl = document.getElementById("role-reveal-avatars");
  if (!el || !titleEl || !subEl || !avatarsEl) return;

  const isImpostor = payload.role === "IMPOSTOR";
  titleEl.textContent = isImpostor ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
  titleEl.className = "role-reveal-title " + (isImpostor ? "impostor" : "crew");
  subEl.textContent = isImpostor
    ? "Gemiyi sabote et ve mürettebatı ortadan kaldır!"
    : "Görevlerini tamamla ve aramızdaki Impostor'u bul!";

  avatarsEl.innerHTML = "";
  const shownPlayers = isImpostor && payload.impostorIds?.length
    ? payload.players.filter((p) => payload.impostorIds!.includes(p.userId))
    : payload.players;

  for (const p of shownPlayers) {
    const item = document.createElement("div");
    item.className = "reveal-player";
    item.innerHTML = `${createCrewmateSvg(COLOR_HEX[p.color] ?? "#e53935", { size: 48 })}<span>${p.username}</span>`;
    avatarsEl.appendChild(item);
  }

  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

function updateSoundButton(): void {
  const soundBtn = document.getElementById("sound-btn")!;
  soundBtn.textContent = audio.isMuted() ? "🔇" : "🔊";
}

function updateTaskProgress(completed: number, total: number): void {
  const el = document.getElementById("task-progress")!;
  document.getElementById("task-completed")!.textContent = String(completed);
  document.getElementById("task-total")!.textContent = String(total);
  const fill = document.getElementById("task-bar-fill");
  if (fill) {
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    fill.style.width = `${pct}%`;
  }
  el.hidden = false;
}

function renderTaskChecklist(): void {
  const listEl = document.getElementById("task-list-items");
  if (!listEl) return;
  listEl.innerHTML = "";

  const tasks = window.__gameTasks ?? [];
  if (tasks.length === 0) {
    const hint = document.createElement("div");
    hint.className = "task-item impostor-hint";
    hint.textContent = "⚡ Sahte görev yap, Vent kullan (E) ve Sabotaj başlat!";
    listEl.appendChild(hint);
    return;
  }

  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "task-item" + (t.completed ? " done" : "");
    const roomName = ROOM_LABELS[t.room] ?? t.room;
    const taskName = TASK_LABELS[t.type] ?? t.type;
    row.textContent = `${t.completed ? "✓" : "○"} ${roomName}: ${taskName}`;
    listEl.appendChild(row);
  }
}

function showGameOver(winner: "CREW" | "IMPOSTOR", players?: GameEndedPlayer[]): void {
  const el = document.getElementById("game-over")!;
  const text = document.getElementById("winner-text")!;
  text.textContent = winner === "CREW" ? "🛠️ MÜRETTEBAT KAZANDI!" : "🔪 IMPOSTOR KAZANDI!";
  text.className = winner === "CREW" ? "crew-win" : "impostor-win";

  const winnersEl = document.getElementById("winner-players");
  if (winnersEl) {
    winnersEl.innerHTML = "";
    for (const p of players ?? []) {
      const card = document.createElement("div");
      card.className = "winner-card";
      const roleClass = p.role === "IMPOSTOR" ? "impostor" : "crew";
      const roleLabel = p.role === "IMPOSTOR" ? "🔪 Impostor" : "🛠️ Crewmate";
      card.innerHTML = `
        ${createCrewmateSvg(COLOR_HEX[p.color] ?? "#e53935", { size: 44, dead: !p.isAlive })}
        <strong>${p.username}</strong>
        <span class="winner-role-tag ${roleClass}">${roleLabel}</span>
      `;
      winnersEl.appendChild(card);
    }
  }

  el.hidden = false;

  const roleText = document.getElementById("role-display")!.textContent ?? "";
  const iWon =
    (winner === "CREW" && roleText.includes("CREWMATE")) ||
    (winner === "IMPOSTOR" && roleText.includes("IMPOSTOR"));
  audio.play(iWon ? "victory" : "defeat");

  const btn = document.getElementById("back-to-lobby")!;
  btn.onclick = () => {
    el.hidden = true;
    const hasLobby = !!document.getElementById("lobby-code")?.textContent?.trim();
    showScreen(hasLobby ? "lobby" : "menu");
  };
}

// ─── Ship Blueprint Minimap ─────────────────────────────────────────────

function toggleMapOverlay(): void {
  const overlay = document.getElementById("map-overlay");
  if (!overlay) return;
  if (overlay.hidden) {
    overlay.hidden = false;
    renderMapCanvas();
    if (mapAnimInterval) clearInterval(mapAnimInterval);
    mapAnimInterval = setInterval(renderMapCanvas, 250);
  } else {
    closeMapOverlay();
  }
}

function closeMapOverlay(): void {
  const overlay = document.getElementById("map-overlay");
  if (overlay) overlay.hidden = true;
  if (mapAnimInterval) {
    clearInterval(mapAnimInterval);
    mapAnimInterval = null;
  }
}

function renderMapCanvas(): void {
  const wrap = document.getElementById("map-canvas-wrap");
  if (!wrap) return;
  let canvas = wrap.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 420;
    wrap.appendChild(canvas);
  }
  const ctx = canvas.getContext("2d")!;
  const scale = 8.6; // 50 tiles * 8.6 ≈ 430px

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw corridors schematic lines
  ctx.strokeStyle = "#1e3a5f";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  const corridors = [
    [[25, 15], [25, 43]], // medbay -> cafeteria -> admin
    [[9, 21], [39, 21]],  // storage -> cafeteria -> weapons
    [[25, 31], [41, 31]], // spine -> navigation
    [[41, 21], [41, 43]], // weapons -> nav -> o2
    [[9, 21], [9, 43]],   // storage -> electrical -> reactor
    [[9, 43], [38, 43]],  // reactor -> admin -> o2
  ];
  for (const [[x1, y1], [x2, y2]] of corridors) {
    ctx.beginPath();
    ctx.moveTo(x1 * scale, y1 * scale - 20);
    ctx.lineTo(x2 * scale, y2 * scale - 20);
    ctx.stroke();
  }

  // Draw rooms
  for (const r of ROOMS) {
    const rx = r.x * scale;
    const ry = r.y * scale - 20;
    const rw = r.w * scale;
    const rh = r.h * scale;
    ctx.fillStyle = r.name === "cafeteria" ? "#2b4c6f" : "#17304d";
    ctx.strokeStyle = "#4ea8de";
    ctx.lineWidth = 2;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(r.label, rx + rw / 2, ry + rh / 2 + 3);
  }

  // Draw uncompleted tasks
  for (const t of window.__gameTasks ?? []) {
    if (t.completed) continue;
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x * scale, t.y * scale - 20, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Draw active sabotage locations
  if (window.__gameSabotage) {
    for (const s of SABOTAGE_LOCATIONS) {
      if (s.type !== window.__gameSabotage.type) continue;
      ctx.fillStyle = "#ef476f";
      ctx.beginPath();
      ctx.arc(s.x * scale, s.y * scale - 20, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw my position
  if (window.__myPos) {
    ctx.fillStyle = "#06d6a0";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(window.__myPos.x * scale, window.__myPos.y * scale - 20, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ─── Monitor panel ──────────────────────────────────────────────────────

function openMonitorPanel(type: MonitorType): void {
  const panel = document.getElementById("monitor-panel")!;
  const title = document.getElementById("monitor-title")!;
  title.textContent =
    type === "cameras" ? "📹 GÜVENLİK KAMERALARI" : type === "admin" ? "🗺️ YÖNETİM MASASI" : "❤️ VİTALS";
  panel.hidden = false;
  openMonitorType = type;
  audio.play("click");

  getSocket().emit("game:monitorQuery", { type });
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(() => {
    if (openMonitorType) getSocket().emit("game:monitorQuery", { type: openMonitorType });
  }, MONITOR_QUERY_INTERVAL_MS);
}

function closeMonitorPanel(): void {
  const panel = document.getElementById("monitor-panel")!;
  panel.hidden = true;
  openMonitorType = null;
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

function renderMonitorPanel(payload: { type: MonitorType; data?: any; error?: string }): void {
  const content = document.getElementById("monitor-content")!;
  content.innerHTML = "";

  if (payload.error === "comms") {
    const lost = document.createElement("div");
    lost.className = "monitor-signal-lost";
    lost.textContent = "📡 SİNYAL YOK (İletişim kesildi)";
    content.appendChild(lost);
    return;
  }
  const data = payload.data;
  if (!data) return;

  if (data.type === "cameras") {
    const grid = document.createElement("div");
    grid.className = "camera-grid";
    for (const room of data.rooms) {
      const card = document.createElement("div");
      card.className = "camera-card";
      const h = document.createElement("h4");
      h.textContent = `🔴 ${ROOM_LABELS[room.room] ?? room.room}`;
      card.appendChild(h);
      const list = document.createElement("div");
      list.className = "camera-players";
      if (room.players.length === 0 && room.corpses.length === 0) {
        const empty = document.createElement("span");
        empty.className = "camera-empty";
        empty.textContent = "(boş)";
        list.appendChild(empty);
      }
      for (const p of room.players) {
        const wrap = document.createElement("span");
        wrap.className = "player-dot";
        wrap.style.backgroundColor = COLOR_HEX[p.color] ?? "#fff";
        list.appendChild(wrap);
      }
      for (const c of room.corpses) {
        const corpse = document.createElement("span");
        corpse.className = "corpse-icon";
        corpse.textContent = "💀";
        corpse.title = `Ceset (${c.color})`;
        list.appendChild(corpse);
      }
      card.appendChild(list);
      grid.appendChild(card);
    }
    content.appendChild(grid);
    return;
  }

  if (data.type === "admin") {
    const grid = document.createElement("div");
    grid.className = "admin-grid";
    for (const room of data.rooms) {
      const item = document.createElement("div");
      item.className = "admin-room";
      const name = document.createElement("span");
      name.textContent = `${ROOM_LABELS[room.room] ?? room.room}:`;
      const count = document.createElement("strong");
      count.textContent = String(room.count);
      item.appendChild(name);
      item.appendChild(count);
      grid.appendChild(item);
    }
    content.appendChild(grid);
    return;
  }

  // vitals
  const list = document.createElement("div");
  list.className = "vitals-list";
  for (const p of data.players) {
    const row = document.createElement("div");
    row.className = "vitals-row" + (p.isAlive ? "" : " dead");
    const name = document.createElement("span");
    name.textContent = p.username;
    const status = document.createElement("span");
    status.textContent = p.isAlive ? "✅" : `💀 (${p.deadAgoSec ?? "?"} sn önce)`;
    row.appendChild(name);
    row.appendChild(status);
    list.appendChild(row);
  }
  content.appendChild(list);
}

// Global type augmentation
declare global {
  interface Window {
    __gameTasks?: TaskClient[];
    __gameCorpses?: { corpseId: string; x: number; y: number; color: string }[];
    __gameSabotage?: { type: string; expiresAt?: number };
    __gameTaskTotal?: number;
    __myPos?: { x: number; y: number };
  }
}
