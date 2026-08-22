import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import { audio } from "../audio/manager.js";
import { MONITOR_QUERY_INTERVAL_MS } from "../constants.js";
import type { MonitorType } from "../constants.js";
import type { GameStartedPayload, TaskClient } from "../types.js";

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

const COLOR_CSS: Record<string, string> = {
  red: "#e53935", blue: "#1e88e5", green: "#43a047", pink: "#ec407a",
  orange: "#fb8c00", yellow: "#fdd835", black: "#212121", white: "#fafafa",
  purple: "#8e24aa", brown: "#795548", cyan: "#00acc1", lime: "#c0ca33",
};

// Active monitor polling state
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let openMonitorType: MonitorType | null = null;

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", async (payload: GameStartedPayload) => {
    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    roleEl.textContent = payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.8)" : "rgba(30,100,200,0.8)";
    updateSoundButton();
    audio.startAmbient();
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      if (data.user) {
        startPhaserGame({ ...payload, myUserId: data.user.id });
      } else {
        startPhaserGame(payload);
      }
    } catch {
      startPhaserGame(payload);
    }
  });

  socket.on("game:tasksAssigned", (payload: { tasks: TaskClient[]; total: number }) => {
    // Store tasks in a global for GameScene to read
    window.__gameTasks = payload.tasks;
    window.__gameTaskTotal = payload.total;
    updateTaskProgress(0, payload.total);
  });

  socket.on("game:taskUpdate", (payload: { completed: number; total: number; taskId?: string }) => {
    updateTaskProgress(payload.completed, payload.total);
    if (payload.taskId) {
      // Mark task complete in the global + dispatch event for GameScene
      const isMine = window.__gameTasks?.some((t) => t.id === payload.taskId) ?? false;
      if (window.__gameTasks) {
        const task = window.__gameTasks.find((t) => t.id === payload.taskId);
        if (task) task.completed = true;
      }
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
    audio.play("alarm");
    audio.setMeetingTempo(true);
  });

  socket.on("game:meetingEnded", (payload: { ejectedId: string | null }) => {
    audio.setMeetingTempo(false);
    if (payload.ejectedId) audio.play("eject");
  });

  socket.on("game:ended", (payload: { winner: "CREW" | "IMPOSTOR" }) => {
    stopPhaserGame();
    closeMonitorPanel();
    audio.stopAmbient();
    audio.setMeetingTempo(false);
    showGameOver(payload.winner);
  });

  socket.on("game:ventState", (payload: any) => {
    audio.play("vent");
    window.dispatchEvent(new CustomEvent("game:ventState", { detail: payload }));
  });

  socket.on("game:sabotageStarted", (payload: any) => {
    audio.play("sabotageAlarm");
    window.dispatchEvent(new CustomEvent("game:sabotageStarted", { detail: payload }));
  });

  socket.on("game:sabotageFixed", (payload: any) => {
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

  // GameScene asks us to open/close monitor panels (DOM lives outside Phaser)
  window.addEventListener("game:monitorOpen", (e) => {
    openMonitorPanel((e as CustomEvent).detail.type as MonitorType);
  });
  window.addEventListener("game:monitorClose", () => {
    closeMonitorPanel();
  });
  document.getElementById("monitor-close")!.addEventListener("click", () => {
    closeMonitorPanel();
  });

  // HUD sound toggle (persistent mute)
  const soundBtn = document.getElementById("sound-btn")!;
  soundBtn.addEventListener("click", () => {
    const muted = audio.toggleMute();
    soundBtn.textContent = muted ? "🔇" : "🔊";
    if (!muted) audio.play("click");
  });
}

function updateSoundButton(): void {
  const soundBtn = document.getElementById("sound-btn")!;
  soundBtn.textContent = audio.isMuted() ? "🔇" : "🔊";
}

function updateTaskProgress(completed: number, total: number): void {
  const el = document.getElementById("task-progress")!;
  document.getElementById("task-completed")!.textContent = String(completed);
  document.getElementById("task-total")!.textContent = String(total);
  el.hidden = false;
}

function showGameOver(winner: "CREW" | "IMPOSTOR"): void {
  const el = document.getElementById("game-over")!;
  const text = document.getElementById("winner-text")!;
  text.textContent = winner === "CREW" ? "🛠️ CREW WINS!" : "🔪 IMPOSTOR WINS!";
  text.className = winner === "CREW" ? "crew-win" : "impostor-win";
  el.hidden = false;

  // Victory/defeat relative to my role (role badge text says which side I was on)
  const roleText = document.getElementById("role-display")!.textContent ?? "";
  const iWon =
    (winner === "CREW" && roleText.includes("CREWMATE")) ||
    (winner === "IMPOSTOR" && roleText.includes("IMPOSTOR"));
  audio.play(iWon ? "victory" : "defeat");

  const btn = document.getElementById("back-to-lobby")!;
  btn.onclick = () => {
    el.hidden = true;
    showScreen("menu");
  };
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

  // Immediate first query, then poll while open
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
        const dot = document.createElement("span");
        dot.className = "player-dot";
        dot.style.backgroundColor = COLOR_CSS[p.color] ?? "#fff";
        list.appendChild(dot);
      }
      for (const c of room.corpses) {
        const corpse = document.createElement("span");
        corpse.className = "corpse-icon";
        corpse.textContent = "💀";
        corpse.title = "Ceset";
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
    __gameTaskTotal?: number;
  }
}
