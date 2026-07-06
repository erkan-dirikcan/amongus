import { closeMinigame } from "./wire.js";
export function openLightsRepair(onComplete: () => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;
  title.textContent = "IŞIKLARI ONAR";
  content.innerHTML = "";
  const btn = document.createElement("button");
  btn.textContent = "Şalteri Aç";
  btn.className = "download-btn";
  btn.addEventListener("click", () => { closeMinigame(); onComplete(); });
  content.appendChild(btn);
  overlay.hidden = false;
}
