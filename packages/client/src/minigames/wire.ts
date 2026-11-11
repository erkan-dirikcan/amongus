const WIRE_COLORS = [
  { name: "red", hex: "#e53935", label: "Kırmızı" },
  { name: "blue", hex: "#1e88e5", label: "Mavi" },
  { name: "green", hex: "#43a047", label: "Yeşil" },
  { name: "yellow", hex: "#fdd835", label: "Sarı" },
];

export function openWireMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "🔌 KABLOLARI RENKLERİNE GÖRE BAĞLA";
  content.innerHTML = "";

  const shuffled = [...WIRE_COLORS].sort(() => Math.random() - 0.5);
  const connected = new Map<string, string>(); // wireName → slotName
  let selectedWire: string | null = null;
  let selectedDot: HTMLElement | null = null;

  for (let i = 0; i < WIRE_COLORS.length; i++) {
    const row = document.createElement("div");
    row.className = "wire-row";

    const dot = document.createElement("div");
    dot.className = "wire-dot";
    dot.style.backgroundColor = WIRE_COLORS[i].hex;
    dot.dataset.wire = WIRE_COLORS[i].name;
    dot.title = WIRE_COLORS[i].label;

    const line = document.createElement("div");
    line.className = "wire-line";
    line.style.flex = "1";
    line.style.height = "6px";
    line.style.borderRadius = "3px";
    line.style.background = "#2b3648";

    const slot = document.createElement("div");
    slot.className = "wire-slot";
    slot.style.borderColor = shuffled[i].hex;
    slot.style.boxShadow = `inset 0 0 8px ${shuffled[i].hex}`;
    slot.dataset.slot = shuffled[i].name;
    slot.title = shuffled[i].label;

    dot.addEventListener("click", () => {
      if (connected.has(WIRE_COLORS[i].name)) return;
      document.querySelectorAll(".wire-dot").forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
      selectedWire = WIRE_COLORS[i].name;
      selectedDot = dot;
    });

    slot.addEventListener("click", () => {
      if (!selectedWire) return;
      const slotColor = shuffled[i].name;
      if (selectedWire === slotColor) {
        const colorHex = WIRE_COLORS.find((c) => c.name === slotColor)!.hex;
        connected.set(selectedWire, slotColor);
        slot.style.backgroundColor = colorHex;
        slot.classList.add("connected");
        if (selectedDot) {
          selectedDot.classList.remove("selected");
          const parentRow = selectedDot.parentElement;
          const wireLine = parentRow?.querySelector(".wire-line") as HTMLElement | null;
          if (wireLine) wireLine.style.background = colorHex;
        }
        selectedWire = null;
        selectedDot = null;
        if (connected.size === WIRE_COLORS.length) {
          setTimeout(() => {
            closeMinigame();
            onComplete(taskId);
          }, 250);
        }
      } else {
        slot.style.transform = "scale(1.2)";
        setTimeout(() => (slot.style.transform = ""), 200);
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
