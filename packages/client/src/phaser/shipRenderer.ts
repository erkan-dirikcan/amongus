import Phaser from "phaser";
import { TILE_SIZE } from "./config.js";
import { ROOMS } from "../constants.js";
import { roundRect } from "./sprites.js";

/**
 * Renders the entire spacecraft ("The Skeld" style) onto high-resolution smooth canvas
 * textures so rooms and corridors look like an authentic hand-crafted Among Us spaceship
 * rather than a blocky 32×32 tile grid.
 */
export function renderShipInterior(
  scene: Phaser.Scene,
  wallGrid: boolean[][],
  mapW: number,
  mapH: number
): void {
  const worldW = mapW * TILE_SIZE;
  const worldH = mapH * TILE_SIZE;

  const isFloor = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return false;
    return !wallGrid[ty][tx];
  };

  // ─── 1. Floor + Hull Base Texture (Depth 0) ────────────────────────
  const floorKey = "ship-floor-hires";
  if (scene.textures.exists(floorKey)) {
    scene.textures.remove(floorKey);
  }
  const floorTex = scene.textures.createCanvas(floorKey, worldW, worldH)!;
  const ctx = floorTex.getContext();

  // 1a. Outer Spacecraft Hull Casing around all walkable areas
  ctx.save();
  ctx.fillStyle = "#0d1524";
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 4;
  for (let r = 0; r < mapH; r++) {
    for (let c = 0; c < mapW; c++) {
      if (!isFloor(c, r)) continue;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      roundRect(ctx, x - 20, y - 26, TILE_SIZE + 40, TILE_SIZE + 44, 14);
      ctx.fill();
    }
  }
  ctx.restore();

  // 1b. Smooth Corridor Base Deck (no 32x32 squares!)
  ctx.save();
  ctx.fillStyle = "#263144";
  for (let r = 0; r < mapH; r++) {
    for (let c = 0; c < mapW; c++) {
      if (!isFloor(c, r)) continue;
      ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
    }
  }

  // Corridor center grated runner & subtle panel seams every 3 tiles
  for (let r = 0; r < mapH; r++) {
    for (let c = 0; c < mapW; c++) {
      if (!isFloor(c, r)) continue;
      const inRoom = ROOMS.some((rm) => c >= rm.x && c < rm.x + rm.w && r >= rm.y && r < rm.y + rm.h);
      if (inRoom) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      // Central recessed grate strip in corridors
      ctx.fillStyle = "#1c2536";
      ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let offset = 8; offset < TILE_SIZE - 4; offset += 8) {
        ctx.moveTo(x + 6, y + offset);
        ctx.lineTo(x + TILE_SIZE - 6, y + offset);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // 1c. Custom Illustrated Rooms (each room is a unified spacecraft compartment)
  for (const room of ROOMS) {
    drawRoomFloorAndProps(ctx, room);
  }

  // 1d. Sci-Fi Doorway Hazard Thresholds where corridors meet rooms
  drawDoorwayThresholds(ctx, isFloor);

  // ─── 2. Continuous 3D Bulkhead Walls & Ambient Shadows ─────────────
  drawContinuousBulkheads(ctx, isFloor, mapW, mapH);

  floorTex.refresh();
  floorTex.setFilter(Phaser.Textures.FilterMode.LINEAR);

  scene.add.image(0, 0, floorKey).setOrigin(0, 0).setDepth(0.5);

  // Animated Reactor Core glow overlay in GameScene
  const coreX = 7.5 * TILE_SIZE;
  const coreY = 42.5 * TILE_SIZE;
  const coreGlow = scene.add.circle(coreX, coreY, 36, 0x38bdf8, 0.25).setDepth(1.2);
  scene.tweens.add({
    targets: coreGlow,
    scale: { from: 0.85, to: 1.25 },
    alpha: { from: 0.18, to: 0.42 },
    duration: 950,
    yoyo: true,
    repeat: -1,
    ease: "Sine.inOut",
  });
}

function drawRoomFloorAndProps(
  ctx: CanvasRenderingContext2D,
  room: (typeof ROOMS)[number]
): void {
  const rx = room.x * TILE_SIZE;
  const ry = room.y * TILE_SIZE;
  const rw = room.w * TILE_SIZE;
  const rh = room.h * TILE_SIZE;
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  // Room-specific base deck color & large smooth deck plating
  const palettes: Record<string, { base: string; plate: string; seam: string; accent: string }> = {
    cafeteria: { base: "#32435c", plate: "#394b66", seam: "rgba(15, 23, 42, 0.35)", accent: "#475d7d" },
    medbay: { base: "#375161", plate: "#415e70", seam: "rgba(15, 23, 42, 0.28)", accent: "#06d6a0" },
    weapons: { base: "#2b3648", plate: "#323f54", seam: "rgba(15, 23, 42, 0.4)", accent: "#10b981" },
    navigation: { base: "#233247", plate: "#2a3c54", seam: "rgba(15, 23, 42, 0.4)", accent: "#38bdf8" },
    o2: { base: "#294145", plate: "#314d52", seam: "rgba(15, 23, 42, 0.35)", accent: "#34d399" },
    admin: { base: "#2c384e", plate: "#34425c", seam: "rgba(15, 23, 42, 0.38)", accent: "#38bdf8" },
    storage: { base: "#353a47", plate: "#3d4352", seam: "rgba(15, 23, 42, 0.42)", accent: "#eab308" },
    electrical: { base: "#232836", plate: "#2a3040", seam: "rgba(10, 14, 23, 0.5)", accent: "#f59e0b" },
    reactor: { base: "#2e2433", plate: "#382b3d", seam: "rgba(10, 14, 23, 0.5)", accent: "#38bdf8" },
  };

  const pal = palettes[room.name] ?? palettes.cafeteria;

  // Radial room lighting gradient on floor
  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(rw, rh) * 0.7);
  grad.addColorStop(0, pal.plate);
  grad.addColorStop(1, pal.base);
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);

  // Large smooth spacecraft deck panels (96×96 or 128×96 — NOT 32×32 blocks!)
  ctx.strokeStyle = pal.seam;
  ctx.lineWidth = 2;
  const plateW = 96;
  const plateH = 96;
  for (let px = rx; px < rx + rw; px += plateW) {
    for (let py = ry; py < ry + rh; py += plateH) {
      ctx.strokeRect(px, py, plateW, plateH);
      // Subtle corner rivets on large deck plates
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(px + 6, py + 6, 1.5, 0, Math.PI * 2);
      ctx.arc(px + plateW - 6, py + 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Room-Specific Architectural Details & Furniture ───────────────
  if (room.name === "cafeteria") {
    // Large concentric floor rings around the central Emergency Table (25.5, 25.5)
    const bx = 25.5 * TILE_SIZE;
    const by = 25.5 * TILE_SIZE;

    ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, 125, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(234, 179, 8, 0.35)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(bx, by, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4 Round Canteen Tables with curved bench seats
    const tablePositions = [
      [22 * TILE_SIZE, 22.4 * TILE_SIZE],
      [28.2 * TILE_SIZE, 22.4 * TILE_SIZE],
      [22 * TILE_SIZE, 28 * TILE_SIZE],
      [28.2 * TILE_SIZE, 28 * TILE_SIZE],
    ];
    for (const [tx, ty] of tablePositions) {
      drawCafeteriaTable(ctx, tx, ty);
    }
  } else if (room.name === "medbay") {
    // Sterile floor border + central medical cross emblem
    ctx.strokeStyle = "rgba(6, 214, 160, 0.25)";
    ctx.lineWidth = 3;
    roundRect(ctx, rx + 18, ry + 26, rw - 36, rh - 40, 12);
    ctx.stroke();

    // Medical cross on floor
    ctx.fillStyle = "rgba(6, 214, 160, 0.16)";
    roundRect(ctx, cx - 8, cy - 24, 16, 48, 4);
    ctx.fill();
    roundRect(ctx, cx - 24, cy - 8, 48, 16, 4);
    ctx.fill();

    // Medical beds along the right side
    for (const by of [ry + 52, ry + 104, ry + 152]) {
      drawMedbayBed(ctx, rx + rw - 68, by);
    }

    // Holographic Bio-Scanner Platform at (22.5, 15.5)
    drawMedbayScanner(ctx, 22.5 * TILE_SIZE, 15.5 * TILE_SIZE);
  } else if (room.name === "weapons") {
    // Tactical octagonal targeting ring on floor
    const wx = cx - 10;
    const wy = cy + 6;
    ctx.fillStyle = "#1e2736";
    ctx.beginPath();
    ctx.arc(wx, wy, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10b981";
    ctx.stroke();

    // Radar crosshairs on floor
    ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wx, wy, 32, 0, Math.PI * 2);
    ctx.moveTo(wx - 44, wy);
    ctx.lineTo(wx + 44, wy);
    ctx.moveTo(wx, wy - 44);
    ctx.lineTo(wx, wy + 44);
    ctx.stroke();

    // Central weapons turret chair & console
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wx, wy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.fillRect(wx + 10, wy - 6, 14, 12);
  } else if (room.name === "navigation") {
    // Glowing blue bridge deck lines leading to the cockpit helm on the right
    ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(rx + 20, cy - 30);
    ctx.lineTo(rx + rw - 42, cy - 55);
    ctx.moveTo(rx + 20, cy + 30);
    ctx.lineTo(rx + rw - 42, cy + 55);
    ctx.stroke();

    // Curved Cockpit Helm Console along right wall
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    roundRect(ctx, rx + rw - 38, ry + 36, 30, rh - 72, 10);
    ctx.fill();
    ctx.stroke();

    // Glowing helm screens
    ctx.fillStyle = "#0284c7";
    roundRect(ctx, rx + rw - 32, ry + 48, 18, 36, 4);
    ctx.fill();
    roundRect(ctx, rx + rw - 32, ry + rh - 84, 18, 36, 4);
    ctx.fill();

    // Pilot chairs
    for (const py of [cy - 34, cy + 34]) {
      ctx.fillStyle = "#334155";
      roundRect(ctx, rx + rw - 68, py - 12, 22, 24, 6);
      ctx.fill();
      ctx.stroke();
    }
  } else if (room.name === "o2") {
    // Glowing green glass Hydroponics / Tree Biodome + O2 filter tanks
    const gx = rx + 46;
    const gy = ry + 62;
    const rad = ctx.createRadialGradient(gx, gy, 4, gx, gy, 34);
    rad.addColorStop(0, "rgba(52, 211, 153, 0.55)");
    rad.addColorStop(1, "rgba(52, 211, 153, 0)");
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(gx, gy, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#064e3b";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tree canopy inside biodome
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(gx - 4, gy - 3, 11, 0, Math.PI * 2);
    ctx.arc(gx + 6, gy + 2, 10, 0, Math.PI * 2);
    ctx.arc(gx, gy - 7, 9, 0, Math.PI * 2);
    ctx.fill();

    // Twin silver O2 filtration cylinders
    for (const ox of [rx + rw - 58, rx + rw - 30]) {
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(ox, ry + 56, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(ox - 3, ry + 53, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (room.name === "admin") {
    // Raised central command mat + Holographic Ship Map Table at (26, 41.8)
    const tx = 26 * TILE_SIZE;
    const ty = 42.2 * TILE_SIZE;

    ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
    roundRect(ctx, tx - 56, ty - 34, 112, 68, 12);
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#334155";
    roundRect(ctx, tx - 48, ty - 26, 96, 52, 10);
    ctx.fill();
    ctx.stroke();

    // Glowing green hologram screen
    ctx.fillStyle = "#064e3b";
    roundRect(ctx, tx - 40, ty - 19, 80, 38, 6);
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mini ship schematic lines inside hologram
    ctx.strokeStyle = "rgba(52, 211, 153, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx - 14, ty - 12, 28, 22);
    ctx.strokeRect(tx - 34, ty - 8, 14, 14);
    ctx.strokeRect(tx + 20, ty - 8, 14, 14);
  } else if (room.name === "storage") {
    // Painted yellow/black cargo bay floor perimeter
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    roundRect(ctx, rx + 42, ry + 42, rw - 84, rh - 76, 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cargo crates & containers
    drawCargoCrate(ctx, 6.5 * TILE_SIZE, 19.3 * TILE_SIZE, 38, 34, "#78553a");
    drawCargoCrate(ctx, 11.4 * TILE_SIZE, 22.4 * TILE_SIZE, 36, 36, "#475569");
    drawCargoCrate(ctx, 6.5 * TILE_SIZE, 22.4 * TILE_SIZE, 34, 34, "#9a3412");
  } else if (room.name === "electrical") {
    // High-voltage floor hazard zone
    ctx.fillStyle = "rgba(234, 179, 8, 0.12)";
    ctx.fillRect(rx + 12, ry + 26, rw - 24, 34);

    // Snaking thick power cables across the floor
    const cables: [string, number[]][] = [
      ["#ef4444", [rx + 36, ry + 34, rx + 70, ry + 110, rx + 40, ry + 190]],
      ["#eab308", [rx + 90, ry + 34, rx + 110, ry + 120, rx + 160, ry + 210]],
      ["#38bdf8", [rx + 150, ry + 34, rx + 140, ry + 100, rx + 210, ry + 160]],
    ];
    for (const [col, pts] of cables) {
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
      ctx.stroke();

      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  } else if (room.name === "reactor") {
    // Glowing plasma conduits leading to the Reactor Core at (7.5, 42.5)
    const coreX = 7.5 * TILE_SIZE;
    const coreY = 42.5 * TILE_SIZE;

    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(rx + rw, coreY - 16);
    ctx.lineTo(coreX, coreY - 16);
    ctx.moveTo(rx + rw, coreY + 16);
    ctx.lineTo(coreX, coreY + 16);
    ctx.stroke();

    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Reactor Core assembly
    const g = ctx.createRadialGradient(coreX, coreY, 4, coreX, coreY, 42);
    g.addColorStop(0, "#e0f2fe");
    g.addColorStop(0.35, "#38bdf8");
    g.addColorStop(0.75, "rgba(2, 132, 199, 0.35)");
    g.addColorStop(1, "rgba(2, 132, 199, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(coreX, coreY, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(coreX, coreY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(coreX, coreY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawCafeteriaTable(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.arc(tx, ty + 4, 31, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0f172a";

  // 4 curved bench seats around the table
  ctx.fillStyle = "#2563eb";
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const bx = tx + Math.cos(angle) * 25;
    const by = ty + Math.sin(angle) * 25;
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Metallic round table top
  const grad = ctx.createRadialGradient(tx - 6, ty - 6, 3, tx, ty, 23);
  grad.addColorStop(0, "#64748b");
  grad.addColorStop(1, "#3b4c63");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(tx, ty, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner rim
  ctx.strokeStyle = "rgba(226, 232, 240, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx, ty, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMedbayBed(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  roundRect(ctx, x + 2, y + 4, 48, 28, 6);
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0f172a";
  ctx.fillStyle = "#cbd5e1";
  roundRect(ctx, x, y, 48, 28, 6);
  ctx.fill();
  ctx.stroke();

  // Blanket
  ctx.fillStyle = "#38bdf8";
  roundRect(ctx, x + 4, y + 3, 28, 22, 4);
  ctx.fill();

  // Pillow
  ctx.fillStyle = "#f8fafc";
  roundRect(ctx, x + 34, y + 5, 10, 18, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMedbayScanner(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 6, x, y, 34);
  glow.addColorStop(0, "rgba(6, 214, 160, 0.45)");
  glow.addColorStop(1, "rgba(6, 214, 160, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0f172a";
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#0d9488";
  ctx.strokeStyle = "#5eead4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCargoCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(ctx, x - w / 2 + 3, y - h / 2 + 4, w, h, 5);
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0f172a";
  ctx.fillStyle = color;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 5);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10);
  ctx.restore();
}

function drawDoorwayThresholds(
  ctx: CanvasRenderingContext2D,
  isFloor: (tx: number, ty: number) => boolean
): void {
  ctx.save();
  for (const room of ROOMS) {
    // Top & bottom room edges
    for (let c = room.x; c < room.x + room.w; c++) {
      if (isFloor(c, room.y - 1)) {
        drawThresholdStrip(ctx, c * TILE_SIZE, room.y * TILE_SIZE - 4, TILE_SIZE, 8);
      }
      if (isFloor(c, room.y + room.h)) {
        drawThresholdStrip(ctx, c * TILE_SIZE, (room.y + room.h) * TILE_SIZE - 4, TILE_SIZE, 8);
      }
    }
    // Left & right room edges
    for (let r = room.y; r < room.y + room.h; r++) {
      if (isFloor(room.x - 1, r)) {
        drawThresholdStrip(ctx, room.x * TILE_SIZE - 4, r * TILE_SIZE, 8, TILE_SIZE);
      }
      if (isFloor(room.x + room.w, r)) {
        drawThresholdStrip(ctx, (room.x + room.w) * TILE_SIZE - 4, r * TILE_SIZE, 8, TILE_SIZE);
      }
    }
  }
  ctx.restore();
}

function drawThresholdStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(234, 179, 8, 0.55)";
  if (w > h) {
    for (let sx = x + 2; sx < x + w - 2; sx += 8) {
      ctx.fillRect(sx, y + 2, 4, h - 4);
    }
  } else {
    for (let sy = y + 2; sy < y + h - 2; sy += 8) {
      ctx.fillRect(x + 2, sy, w - 4, 4);
    }
  }
}

/**
 * Draws continuous, seamless 3D spacecraft bulkheads along the boundary between
 * walkable floor tiles and solid wall tiles — completely eliminating the blocky
 * 32×32 Minecraft brick look.
 */
function drawContinuousBulkheads(
  ctx: CanvasRenderingContext2D,
  isFloor: (tx: number, ty: number) => boolean,
  mapW: number,
  mapH: number
): void {
  ctx.save();

  // 1. North Interior 3D Bulkhead Walls (where wall is above walkable floor)
  // Drawn as continuous horizontal spans!
  for (let r = 0; r < mapH; r++) {
    let spanStart = -1;
    for (let c = 0; c <= mapW; c++) {
      const hasNorthWall = c < mapW && isFloor(c, r) && !isFloor(c, r - 1);
      if (hasNorthWall && spanStart === -1) {
        spanStart = c;
      } else if (!hasNorthWall && spanStart !== -1) {
        drawNorthWallSpan(ctx, spanStart, c - 1, r);
        spanStart = -1;
      }
    }
  }

  // 2. Ambient Floor Shadows along East, West, and South walls
  for (let r = 0; r < mapH; r++) {
    for (let c = 0; c < mapW; c++) {
      if (!isFloor(c, r)) continue;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      if (!isFloor(c - 1, r)) {
        const g = ctx.createLinearGradient(x, y, x + 10, y);
        g.addColorStop(0, "rgba(0,0,0,0.42)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 10, TILE_SIZE);
      }
      if (!isFloor(c + 1, r)) {
        const g = ctx.createLinearGradient(x + TILE_SIZE, y, x + TILE_SIZE - 10, y);
        g.addColorStop(0, "rgba(0,0,0,0.42)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + TILE_SIZE - 10, y, 10, TILE_SIZE);
      }
      if (!isFloor(c, r + 1)) {
        const g = ctx.createLinearGradient(x, y + TILE_SIZE, x, y + TILE_SIZE - 8);
        g.addColorStop(0, "rgba(0,0,0,0.45)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, y + TILE_SIZE - 8, TILE_SIZE, 8);
      }
    }
  }

  // 3. Continuous Thick Metallic Hull Trim around all wall-to-floor boundaries
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const traceBoundaries = () => {
    ctx.beginPath();
    for (let r = 0; r < mapH; r++) {
      for (let c = 0; c < mapW; c++) {
        if (!isFloor(c, r)) continue;
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        // South edge
        if (!isFloor(c, r + 1)) {
          ctx.moveTo(x, y + TILE_SIZE);
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
        }
        // West edge
        if (!isFloor(c - 1, r)) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + TILE_SIZE);
        }
        // East edge
        if (!isFloor(c + 1, r)) {
          ctx.moveTo(x + TILE_SIZE, y);
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
        }
      }
    }
  };

  // Outer dark steel casing
  ctx.strokeStyle = "#090d16";
  ctx.lineWidth = 10;
  traceBoundaries();
  ctx.stroke();

  // Metallic mid-rail
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 6;
  traceBoundaries();
  ctx.stroke();

  // Inner bright steel bevel highlight
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  traceBoundaries();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a continuous 3D angled interior bulkhead wall along the top edge of a room/corridor
 * from tile column `c1` to `c2` at row `r`.
 */
function drawNorthWallSpan(
  ctx: CanvasRenderingContext2D,
  c1: number,
  c2: number,
  r: number
): void {
  const x = c1 * TILE_SIZE;
  const w = (c2 - c1 + 1) * TILE_SIZE;
  const floorY = r * TILE_SIZE;
  const wallH = 24;
  const wallTop = floorY - wallH + 6; // extends slightly into the top of the room + into the wall above

  ctx.save();

  // 1. Soft floor drop shadow below the bulkhead
  const shGrad = ctx.createLinearGradient(0, floorY + 6, 0, floorY + 20);
  shGrad.addColorStop(0, "rgba(0, 0, 0, 0.52)");
  shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shGrad;
  ctx.fillRect(x, floorY + 6, w, 14);

  // 2. Continuous 3D vertical wall face gradient
  const wallGrad = ctx.createLinearGradient(0, wallTop, 0, floorY + 6);
  wallGrad.addColorStop(0, "#475975");
  wallGrad.addColorStop(0.55, "#334259");
  wallGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(x, wallTop, w, wallH);

  // 3. Top dark structural header beam
  ctx.fillStyle = "#090d16";
  ctx.fillRect(x - 2, wallTop - 6, w + 4, 6);
  ctx.fillStyle = "#64748b";
  ctx.fillRect(x, wallTop - 1, w, 2);

  // 4. Sci-fi wall ribs & decorative bulkhead panels every 80px (not 32px!)
  const ribSpacing = 80;
  for (let px = x + 24; px < x + w - 28; px += ribSpacing) {
    // Vertical structural rib
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(px, wallTop + 1, 5, wallH - 4);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(px + 1, wallTop + 1, 1.5, wallH - 4);

    // Recessed sci-fi wall panel or window between ribs
    if (px + 52 < x + w - 12) {
      roundRect(ctx, px + 12, wallTop + 4, 38, wallH - 11, 3);
      ctx.fillStyle = "#172133";
      ctx.fill();
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Glowing cyan/amber status LED strip on bulkhead
      ctx.fillStyle = (px / ribSpacing) % 2 === 0 ? "#38bdf8" : "#10b981";
      ctx.fillRect(px + 16, wallTop + 7, 12, 2.5);
    }
  }

  // 5. Baseboard trim where wall meets floor
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x, floorY + 4, w, 3);
  ctx.fillStyle = "#475569";
  ctx.fillRect(x, floorY + 2, w, 2);

  ctx.restore();
}
