import { closeMinigame } from "./wire.js";
import { getSocket } from "../network/socket.js";

// Must match MEDBAY_SCAN_DURATION_MS in @amongus/shared (client keeps its own bundle)
const SCAN_DURATION_MS = 15000;

export function openMedbayScanMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "MEDBAY TARAMASI";
  content.innerHTML = "";

  // Notify the server the visual task started — same-room players see the animation
  getSocket().emit("game:visualTaskStart", { taskId });

  const status = document.createElement("div");
  status.className = "scan-status";
  status.textContent = "DOĞRULANIYOR...";

  const bar = document.createElement("div");
  bar.className = "download-bar";
  const fill = document.createElement("div");
  fill.className = "download-fill";
  bar.appendChild(fill);

  const countdown = document.createElement("div");
  countdown.className = "scan-countdown";
  countdown.textContent = `${Math.ceil(SCAN_DURATION_MS / 1000)} sn`;

  content.appendChild(status);
  content.appendChild(bar);
  content.appendChild(countdown);
  overlay.hidden = false;

  const startedAt = performance.now();
  const interval = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    const pct = Math.min(100, (elapsed / SCAN_DURATION_MS) * 100);
    fill.style.width = `${pct}%`;
    const remaining = Math.max(0, Math.ceil((SCAN_DURATION_MS - elapsed) / 1000));
    countdown.textContent = `${remaining} sn`;
    if (elapsed >= SCAN_DURATION_MS) {
      clearInterval(interval);
      status.textContent = "✅ DOĞRULANDI";
      status.style.color = "#06d6a0";
      setTimeout(() => {
        closeMinigame();
        onComplete(taskId);
      }, 400);
    }
  }, 100);
}
