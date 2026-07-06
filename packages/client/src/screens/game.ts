import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import type { GameStartedPayload, TaskClient } from "../types.js";

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", async (payload: GameStartedPayload) => {
    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    roleEl.textContent = payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.8)" : "rgba(30,100,200,0.8)";
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
      if (window.__gameTasks) {
        const task = window.__gameTasks.find((t) => t.id === payload.taskId);
        if (task) task.completed = true;
      }
      window.dispatchEvent(new CustomEvent("game:taskCompleted", { detail: { taskId: payload.taskId } }));
    }
  });

  socket.on("game:playerKilled", () => {
    // GameScene handles corpse rendering via game:corpseAdded
  });

  socket.on("game:corpseAdded", (payload: { corpseId: string; x: number; y: number; color: string }) => {
    window.dispatchEvent(new CustomEvent("game:corpse", { detail: payload }));
  });

  socket.on("game:killResult", (payload: { success: boolean; cooldownUntil: number; message?: string }) => {
    window.dispatchEvent(new CustomEvent("game:killResult", { detail: payload }));
  });

  socket.on("game:reportResult", (payload: { success: boolean; message: string }) => {
    window.dispatchEvent(new CustomEvent("game:reportResult", { detail: payload }));
  });

  socket.on("game:ended", (payload: { winner: "CREW" | "IMPOSTOR" }) => {
    stopPhaserGame();
    showGameOver(payload.winner);
  });
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

  const btn = document.getElementById("back-to-lobby")!;
  btn.onclick = () => {
    el.hidden = true;
    showScreen("menu");
  };
}

// Global type augmentation
declare global {
  interface Window {
    __gameTasks?: TaskClient[];
    __gameTaskTotal?: number;
  }
}
