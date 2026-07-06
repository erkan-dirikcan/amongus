import { closeMinigame } from "./wire.js";
export function openO2Repair(location: string, onComplete: (code: string, location: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;
  title.textContent = `O2 KODU (${location})`;
  content.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text"; input.placeholder = "4 haneli kod"; input.maxLength = 4;
  const btn = document.createElement("button");
  btn.textContent = "Gönder"; btn.className = "download-btn";
  btn.addEventListener("click", () => { if (input.value.length === 4) { closeMinigame(); onComplete(input.value, location); } });
  content.appendChild(input); content.appendChild(btn);
  overlay.hidden = false;
}
