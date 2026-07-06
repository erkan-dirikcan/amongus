export function openReactorRepair(onHold: () => void): void {
  // Simple: show a "HOLD" button that emits reactorHold
  const alert = document.getElementById("sabotage-alert")!;
  alert.textContent = "☢️ REACTOR — Butona bas ve tut!";
  alert.hidden = false;
  // In a real game this would be at the reactor location; for simplicity, click anywhere
  const btn = document.createElement("button");
  btn.textContent = "HOLD";
  btn.style.position = "fixed";
  btn.style.bottom = "200px";
  btn.style.left = "50%";
  btn.style.transform = "translateX(-50%)";
  btn.style.zIndex = "150";
  btn.addEventListener("click", () => { onHold(); btn.remove(); });
  document.body.appendChild(btn);
}
