import Phaser from "phaser";
import { PLAYER_COLORS } from "../constants.js";

// All in-game art is generated at boot on a 2D canvas so every player colour
// gets its own crewmate spritesheet (no tinting — tint would also recolour the
// visor) and the markers stay crisp under the pixel-art camera zoom.

export const FRAME = 32;
export const DIRS = ["down", "up", "left", "right"] as const;
export type Dir = (typeof DIRS)[number];

/** Frame index inside a player sheet: dirs × [idle, walkA, walkB], then dead. */
export function playerFrame(dir: Dir, step: 0 | 1 | 2): number {
  return DIRS.indexOf(dir) * 3 + step;
}
export const DEAD_FRAME = DIRS.length * 3;

export function playerKey(color: string): string {
  return `player-${color}`;
}

function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}
function shade(n: number, f: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return hex((r << 16) | (g << 8) | b);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw one crewmate frame at (ox, oy). step: 0 idle, 1/2 walk poses. */
function drawCrewmate(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number, dir: Dir, step: 0 | 1 | 2): void {
  const base = hex(color);
  const dark = shade(color, 0.55);
  const light = shade(color, 1.25);
  const bob = step === 0 ? 0 : 1; // body bobs while walking
  const cx = ox + FRAME / 2;
  const top = oy + 5 + bob;

  // Legs first (behind the body)
  const legA = step === 1 ? 2 : step === 2 ? -1 : 0;
  const legB = -legA;
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 8, oy + 24 + legA, 6, 6);
  ctx.fillRect(cx + 2, oy + 24 + legB, 6, 6);
  ctx.fillStyle = base;
  ctx.fillRect(cx - 7, oy + 24 + legA, 4, 5);
  ctx.fillRect(cx + 3, oy + 24 + legB, 4, 5);

  // Backpack (on the side away from the visor)
  const packSide = dir === "right" ? -1 : dir === "left" ? 1 : -1;
  if (dir !== "up") {
    ctx.fillStyle = dark;
    roundRect(ctx, cx + (packSide < 0 ? -14 : 8), top + 7, 6, 12, 2);
    ctx.fill();
    ctx.fillStyle = base;
    roundRect(ctx, cx + (packSide < 0 ? -13 : 9), top + 8, 4, 10, 2);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = dark;
  roundRect(ctx, cx - 10, top, 20, 24, 8);
  ctx.fill();
  ctx.fillStyle = base;
  roundRect(ctx, cx - 8, top + 2, 16, 20, 7);
  ctx.fill();
  // Highlight strip
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.5;
  roundRect(ctx, cx - 6, top + 4, 4, 12, 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Backpack in front when facing up
  if (dir === "up") {
    ctx.fillStyle = dark;
    roundRect(ctx, cx - 4, top + 6, 8, 13, 2);
    ctx.fill();
    ctx.fillStyle = base;
    roundRect(ctx, cx - 3, top + 7, 6, 11, 2);
    ctx.fill();
  }

  // Visor
  if (dir !== "up") {
    const vx = dir === "down" ? cx + 1 : dir === "left" ? cx - 9 : cx + 1;
    const vw = dir === "down" ? 10 : 9;
    ctx.fillStyle = "#1f2a3a";
    roundRect(ctx, vx - 1, top + 5, vw + 2, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#8fd3ff";
    roundRect(ctx, vx, top + 6, vw, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(vx + 1, top + 7, 3, 2);
  }
}

/** Dead body: lower half of the suit with a bone sticking out. */
function drawCorpse(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number): void {
  const base = hex(color);
  const dark = shade(color, 0.55);
  const cx = ox + FRAME / 2;
  const top = oy + 14;
  ctx.fillStyle = dark;
  roundRect(ctx, cx - 10, top, 20, 14, 6);
  ctx.fill();
  ctx.fillStyle = base;
  roundRect(ctx, cx - 8, top + 2, 16, 11, 5);
  ctx.fill();
  // Legs
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 8, top + 12, 6, 5);
  ctx.fillRect(cx + 2, top + 12, 6, 5);
  // Bone
  ctx.strokeStyle = "#f4f1e8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 3, top + 1);
  ctx.lineTo(cx + 3, top - 8);
  ctx.stroke();
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.arc(cx + 1, top - 9, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 5, top - 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Blood pool
  ctx.fillStyle = "rgba(160, 20, 30, 0.75)";
  ctx.beginPath();
  ctx.ellipse(cx + 2, top + 15, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** One spritesheet per colour: 4 dirs × 3 poses + 1 dead frame. */
export function generatePlayerTextures(scene: Phaser.Scene): void {
  const frames = DIRS.length * 3 + 1;
  for (const [color, value] of Object.entries(PLAYER_COLORS)) {
    const key = playerKey(color);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, FRAME * frames, FRAME)!;
    const ctx = tex.getContext();
    let i = 0;
    for (const dir of DIRS) {
      for (const step of [0, 1, 2] as const) {
        drawCrewmate(ctx, i * FRAME, 0, value, dir, step);
        tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
        i++;
      }
    }
    drawCorpse(ctx, i * FRAME, 0, value);
    tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
    tex.refresh();
  }
}

export function createPlayerAnimations(scene: Phaser.Scene): void {
  for (const color of Object.keys(PLAYER_COLORS)) {
    const key = playerKey(color);
    for (const dir of DIRS) {
      if (!scene.anims.exists(`${key}-idle-${dir}`)) {
        scene.anims.create({ key: `${key}-idle-${dir}`, frames: [{ key, frame: playerFrame(dir, 0) }], frameRate: 1 });
      }
      if (!scene.anims.exists(`${key}-walk-${dir}`)) {
        scene.anims.create({
          key: `${key}-walk-${dir}`,
          frames: [
            { key, frame: playerFrame(dir, 1) },
            { key, frame: playerFrame(dir, 0) },
            { key, frame: playerFrame(dir, 2) },
            { key, frame: playerFrame(dir, 0) },
          ],
          frameRate: 10,
          repeat: -1,
        });
      }
    }
  }
}

/** Static markers: task console, monitor screen, vent grate, light mask. */
export function generateMarkerTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("task-marker")) {
    const tex = scene.textures.createCanvas("task-marker", 24, 24)!;
    const ctx = tex.getContext();
    // Console box
    ctx.fillStyle = "#2b2f3a";
    roundRect(ctx, 2, 4, 20, 16, 3);
    ctx.fill();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    roundRect(ctx, 2, 4, 20, 16, 3);
    ctx.stroke();
    // Screen
    ctx.fillStyle = "#1c7c54";
    ctx.fillRect(5, 7, 14, 7);
    ctx.fillStyle = "#7bffb0";
    ctx.fillRect(6, 8, 6, 2);
    ctx.fillRect(6, 11, 10, 2);
    // Buttons
    ctx.fillStyle = "#ef476f";
    ctx.fillRect(6, 16, 3, 2);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(10, 16, 3, 2);
    ctx.fillStyle = "#4ea8de";
    ctx.fillRect(14, 16, 3, 2);
    tex.refresh();
  }

  if (!scene.textures.exists("task-arrow")) {
    const tex = scene.textures.createCanvas("task-arrow", 16, 12)!;
    const ctx = tex.getContext();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(2, 1);
    ctx.lineTo(14, 1);
    ctx.lineTo(8, 11);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }

  if (!scene.textures.exists("monitor")) {
    const tex = scene.textures.createCanvas("monitor", 28, 26)!;
    const ctx = tex.getContext();
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(11, 19, 6, 5);
    ctx.fillRect(7, 23, 14, 3);
    ctx.fillStyle = "#1f2733";
    roundRect(ctx, 1, 1, 26, 19, 3);
    ctx.fill();
    ctx.strokeStyle = "#4ea8de";
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, 26, 19, 3);
    ctx.stroke();
    ctx.fillStyle = "#0b3c5d";
    ctx.fillRect(4, 4, 20, 13);
    ctx.fillStyle = "#4ea8de";
    ctx.fillRect(6, 6, 7, 4);
    ctx.fillRect(15, 6, 7, 4);
    ctx.fillRect(6, 12, 7, 3);
    ctx.fillRect(15, 12, 7, 3);
    tex.refresh();
  }

  if (!scene.textures.exists("vent")) {
    const tex = scene.textures.createCanvas("vent", 30, 22)!;
    const ctx = tex.getContext();
    ctx.fillStyle = "#3b4252";
    roundRect(ctx, 0, 0, 30, 22, 4);
    ctx.fill();
    ctx.fillStyle = "#1a1e26";
    roundRect(ctx, 3, 3, 24, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#5c667a";
    for (let y = 5; y < 18; y += 4) ctx.fillRect(5, y, 20, 2);
    tex.refresh();
  }

  if (!scene.textures.exists("emergency-button")) {
    const tex = scene.textures.createCanvas("emergency-button", 40, 40)!;
    const ctx = tex.getContext();
    // Round table
    ctx.fillStyle = "#5a4630";
    ctx.beginPath(); ctx.arc(20, 20, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a6b45";
    ctx.beginPath(); ctx.arc(20, 20, 16, 0, Math.PI * 2); ctx.fill();
    // Button housing + red dome
    ctx.fillStyle = "#2b2f3a";
    ctx.beginPath(); ctx.arc(20, 20, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c62828";
    ctx.beginPath(); ctx.arc(20, 19, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff7b7b";
    ctx.beginPath(); ctx.arc(18, 17, 2, 0, Math.PI * 2); ctx.fill();
    tex.refresh();
  }

  if (!scene.textures.exists("darkness")) {
    // Lights-out vignette: transparent around the player, near-black beyond.
    // Drawn at 512px and scaled up 4× (linear filtered) so it covers the view.
    const size = 512;
    const tex = scene.textures.createCanvas("darkness", size, size)!;
    const ctx = tex.getContext();
    // ~4 tiles of clear view (radius in texture px × 4 scale ÷ 32 px tiles)
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.075);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0.95)");
    ctx.fillStyle = g; // the last stop extends beyond the radius, covering the rest
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
