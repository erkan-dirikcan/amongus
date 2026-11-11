import { closeMinigame } from "./wire.js";

export function openO2Repair(location: string, onComplete: (code: string, location: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;
  title.textContent = `🫧 O2 ACİL DURUM KODU (${location.toUpperCase()})`;
  content.innerHTML = "";

  const targetCode = String(Math.floor(1000 + Math.random() * 9000));
  let entered = "";

  const note = document.createElement("div");
  note.className = "sticky-note";
  note.innerHTML = `<span>📌 BUGÜNÜN O2 KODU:</span> <strong>${targetCode}</strong>`;

  const screen = document.createElement("div");
  screen.className = "keypad-screen";
  screen.textContent = "----";

  const pad = document.createElement("div");
  pad.className = "keypad-grid";

  const updateScreen = () => {
    screen.textContent = entered.padEnd(4, "-");
  };

  for (const key of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "✓"]) {
    const btn = document.createElement("button");
    btn.className = "keypad-btn";
    btn.textContent = key;
    btn.addEventListener("click", () => {
      if (key === "C") {
        entered = "";
        screen.style.color = "#06d6a0";
        updateScreen();
      } else if (key === "✓") {
        if (entered === targetCode) {
          closeMinigame();
          onComplete(entered, location);
        } else {
          screen.style.color = "#ef476f";
          screen.textContent = "HATA";
          entered = "";
        }
      } else if (entered.length < 4) {
        entered += key;
        screen.style.color = "#06d6a0";
        updateScreen();
        if (entered === targetCode) {
          setTimeout(() => {
            closeMinigame();
            onComplete(entered, location);
          }, 200);
        }
      }
    });
    pad.appendChild(btn);
  }

  content.appendChild(note);
  content.appendChild(screen);
  content.appendChild(pad);
  overlay.hidden = false;
}
