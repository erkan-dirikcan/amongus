import { closeMinigame } from "./wire.js";

export function openLightsRepair(onComplete: () => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;
  title.textContent = "💡 ELEKTRİK ŞALTERLERİNİ AÇ";
  content.innerHTML = "";

  // 5 switches, ensure at least 3 start OFF
  const states = [false, true, false, false, true].sort(() => Math.random() - 0.5);

  const hint = document.createElement("p");
  hint.style.textAlign = "center";
  hint.style.color = "#a8b8d0";
  hint.style.marginBottom = "14px";
  hint.textContent = "Tüm ışıkların yeşil yanması için kapalı şalterleri yukarı kaldırın.";
  content.appendChild(hint);

  const row = document.createElement("div");
  row.className = "breaker-row";

  const render = () => {
    row.innerHTML = "";
    states.forEach((isOn, idx) => {
      const col = document.createElement("div");
      col.className = "breaker-col";

      const led = document.createElement("div");
      led.className = "breaker-led" + (isOn ? " on" : "");

      const sw = document.createElement("button");
      sw.className = "breaker-switch" + (isOn ? " on" : "");
      sw.innerHTML = `<span class="breaker-knob"></span>`;
      sw.addEventListener("click", () => {
        states[idx] = !states[idx];
        render();
        if (states.every(Boolean)) {
          setTimeout(() => {
            closeMinigame();
            onComplete();
          }, 250);
        }
      });

      col.appendChild(led);
      col.appendChild(sw);
      row.appendChild(col);
    });
  };

  render();
  content.appendChild(row);
  overlay.hidden = false;
}
