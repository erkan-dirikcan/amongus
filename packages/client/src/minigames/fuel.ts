import { closeMinigame } from "./wire.js";

const CANISTERS = 2;
const FILL_RATE_PER_SEC = 45; // %/s while held — ~2.2s per canister

export function openFuelMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "YAKIT DOLDUR";
  content.innerHTML = "";

  const status = document.createElement("div");
  status.className = "fuel-status";
  status.textContent = "Bidonu doldur (1/2)";

  const row = document.createElement("div");
  row.className = "fuel-row";

  const fills: HTMLDivElement[] = [];
  for (let i = 0; i < CANISTERS; i++) {
    const wrap = document.createElement("div");
    wrap.className = "fuel-canister";
    const fill = document.createElement("div");
    fill.className = "fuel-fill";
    wrap.appendChild(fill);
    row.appendChild(wrap);
    fills.push(fill);
  }

  const btn = document.createElement("button");
  btn.className = "fuel-btn";
  btn.textContent = "BASILI TUT";

  let current = 0;
  let fillLevel = 0;
  let holding = false;
  let lastTime = performance.now();
  let rafId = 0;

  function tick(now: number): void {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (holding) {
      fillLevel = Math.min(100, fillLevel + FILL_RATE_PER_SEC * dt);
      fills[current].style.height = `${fillLevel}%`;
      if (fillLevel >= 100) {
        current++;
        fillLevel = 0;
        holding = false;
        if (current >= CANISTERS) {
          btn.disabled = true;
          btn.textContent = "TAMAM ✅";
          setTimeout(() => {
            closeMinigame();
            onComplete(taskId);
          }, 350);
          return;
        }
        status.textContent = `Bidonu doldur (${current + 1}/${CANISTERS})`;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  const startHold = (e: Event): void => {
    e.preventDefault();
    if (current < CANISTERS) holding = true;
  };
  const endHold = (): void => {
    holding = false;
  };

  btn.addEventListener("pointerdown", startHold);
  btn.addEventListener("pointerup", endHold);
  btn.addEventListener("pointerleave", endHold);

  content.appendChild(status);
  content.appendChild(row);
  content.appendChild(btn);
  overlay.hidden = false;

  rafId = requestAnimationFrame(tick);
}
