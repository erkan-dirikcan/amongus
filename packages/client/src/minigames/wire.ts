const WIRE_COLORS = [
  { name: "red", hex: "#e53935" },
  { name: "blue", hex: "#1e88e5" },
  { name: "green", hex: "#43a047" },
  { name: "yellow", hex: "#fdd835" },
];

export function openWireMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "KABLOLARI BAĞLA";
  content.innerHTML = "";

  const shuffled = [...WIRE_COLORS].sort(() => Math.random() - 0.5);
  const connected = new Map<string, string>(); // wireName → slotName
  let selectedWire: string | null = null;

  for (let i = 0; i < WIRE_COLORS.length; i++) {
    const row = document.createElement("div");
    row.className = "wire-row";

    const dot = document.createElement("div");
    dot.className = "wire-dot";
    dot.style.backgroundColor = WIRE_COLORS[i].hex;
    dot.dataset.wire = WIRE_COLORS[i].name;

    const line = document.createElement("div");
    line.style.flex = "1";
    line.style.height = "2px";
    line.style.background = "#444";

    const slot = document.createElement("div");
    slot.className = "wire-slot";
    slot.dataset.slot = shuffled[i].name;

    dot.addEventListener("click", () => {
      document.querySelectorAll(".wire-dot").forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
      selectedWire = WIRE_COLORS[i].name;
    });

    slot.addEventListener("click", () => {
      if (!selectedWire) return;
      const slotColor = shuffled[i].name;
      if (selectedWire === slotColor) {
        connected.set(selectedWire, slotColor);
        slot.style.backgroundColor = WIRE_COLORS.find((c) => c.name === slotColor)!.hex;
        slot.classList.add("connected");
        dot.classList.remove("selected");
        selectedWire = null;
        if (connected.size === WIRE_COLORS.length) {
          closeMinigame();
          onComplete(taskId);
        }
      } else {
        // Wrong match — flash red
        slot.style.borderColor = "#f00";
        setTimeout(() => (slot.style.borderColor = ""), 300);
      }
    });

    row.appendChild(dot);
    row.appendChild(line);
    row.appendChild(slot);
    content.appendChild(row);
  }

  overlay.hidden = false;
}

export function closeMinigame(): void {
  const overlay = document.getElementById("minigame-overlay")!;
  overlay.hidden = true;
  document.getElementById("minigame-content")!.innerHTML = "";
}
