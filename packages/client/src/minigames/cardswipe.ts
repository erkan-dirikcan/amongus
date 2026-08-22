import { closeMinigame } from "./wire.js";

// Swipe must be slower than MIN_MS and faster than MAX_MS (classic Among Us feel)
const MIN_SWIPE_MS = 350;
const MAX_SWIPE_MS = 1500;

export function openCardSwipeMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "KARTI OKUT";
  content.innerHTML = "";

  const reader = document.createElement("div");
  reader.className = "card-reader";

  const slot = document.createElement("div");
  slot.className = "card-slot";

  const card = document.createElement("div");
  card.className = "swipe-card";
  card.textContent = "ID CARD";

  const status = document.createElement("div");
  status.className = "swipe-status";
  status.textContent = "Kartı yukarıdaki yuvadan soldan sağa sürükle";

  let dragging = false;
  let startX = 0;
  let startTime = 0;
  let cardX = 0;
  const maxTravel = 240; // px of travel that counts as a full swipe

  function resetCard(msg?: string): void {
    dragging = false;
    cardX = 0;
    card.style.transform = "translateX(0px)";
    if (msg) {
      status.textContent = msg;
      status.style.color = "#ff6b6b";
      setTimeout(() => {
        status.textContent = "Kartı yukarıdaki yuvadan soldan sağa sürükle";
        status.style.color = "";
      }, 1200);
    }
  }

  card.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX - cardX;
    startTime = performance.now();
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    cardX = Math.max(0, Math.min(maxTravel, e.clientX - startX));
    card.style.transform = `translateX(${cardX}px)`;
  });

  card.addEventListener("pointerup", () => {
    if (!dragging) return;
    const duration = performance.now() - startTime;
    if (cardX >= maxTravel * 0.95) {
      if (duration < MIN_SWIPE_MS) {
        resetCard("ÇOK HIZLI — BAD READ");
      } else if (duration > MAX_SWIPE_MS) {
        resetCard("ÇOK YAVAŞ — BAD READ");
      } else {
        status.textContent = "✅ OKUTULDU";
        status.style.color = "#06d6a0";
        card.style.transform = "translateX(260px)";
        setTimeout(() => {
          closeMinigame();
          onComplete(taskId);
        }, 400);
        return;
      }
    } else {
      resetCard();
    }
  });

  slot.appendChild(card);
  reader.appendChild(slot);
  content.appendChild(reader);
  content.appendChild(status);

  overlay.hidden = false;
}
