import { closeMinigame } from "./wire.js";

export function openReactorRepair(onHold: () => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;
  title.textContent = "☢️ REAKTÖR BİYOMETRİK DOĞRULAMA";
  content.innerHTML = "";

  const status = document.createElement("p");
  status.className = "scan-status";
  status.textContent = "EL İZİ OKUYUCUYA BASILI TUTUN";

  const pad = document.createElement("button");
  pad.className = "reactor-hand-pad";
  pad.innerHTML = `<div class="hand-icon">🖐️</div><div class="hand-scanline"></div>`;

  const barWrap = document.createElement("div");
  barWrap.className = "download-bar";
  const fill = document.createElement("div");
  fill.className = "download-fill";
  barWrap.appendChild(fill);

  let progress = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let done = false;

  const startHold = () => {
    if (done || timer) return;
    pad.classList.add("holding");
    status.textContent = "DOĞRULANIYOR... BIRAKMAYIN";
    timer = setInterval(() => {
      progress = Math.min(100, progress + 5);
      fill.style.width = `${progress}%`;
      if (progress >= 100 && !done) {
        done = true;
        if (timer) clearInterval(timer);
        timer = null;
        status.textContent = "REAKTÖR STABİLİZE EDİLDİ!";
        setTimeout(() => {
          closeMinigame();
          onHold();
        }, 200);
      }
    }, 80);
  };

  const stopHold = () => {
    if (done) return;
    pad.classList.remove("holding");
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    status.textContent = "EL İZİ OKUYUCUYA BASILI TUTUN";
  };

  pad.addEventListener("pointerdown", startHold);
  pad.addEventListener("pointerup", stopHold);
  pad.addEventListener("pointerleave", stopHold);

  content.appendChild(status);
  content.appendChild(pad);
  content.appendChild(barWrap);
  overlay.hidden = false;
}
