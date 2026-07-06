import { closeMinigame } from "./wire.js";

export function openDownloadMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "VERİ İNDİR";
  content.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "download-bar";
  const fill = document.createElement("div");
  fill.className = "download-fill";
  bar.appendChild(fill);
  content.appendChild(bar);

  const btn = document.createElement("button");
  btn.className = "download-btn";
  btn.textContent = "Başlat";
  content.appendChild(btn);

  let progress = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  btn.addEventListener("click", () => {
    if (interval) return;
    btn.textContent = "İndiriliyor...";
    btn.disabled = true;
    interval = setInterval(() => {
      progress += 3.3;
      if (progress >= 100) {
        progress = 100;
        fill.style.width = "100%";
        if (interval) clearInterval(interval);
        setTimeout(() => {
          closeMinigame();
          onComplete(taskId);
        }, 300);
      } else {
        fill.style.width = `${progress}%`;
      }
    }, 100);
  });

  overlay.hidden = false;
}
