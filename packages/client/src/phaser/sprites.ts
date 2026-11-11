import Phaser from "phaser";
import { PLAYER_COLORS } from "../constants.js";

// High-resolution vector/cartoon spritesheet generated at boot on a 2D canvas.
// Rendered at 96×96 per frame with linear filtering and scaled down in world space
// so characters stay razor-sharp and smooth (authentic Among Us cartoon style) at any zoom.

export const FRAME = 96;
export const PLAYER_SPRITE_SCALE = 0.42;
export const DIRS = ["down", "up", "left", "right"] as const;
export type Dir = (typeof DIRS)[number];
export const STEPS_PER_DIR = 7; // 0 = idle, 1..6 = 6-frame smooth waddle walk cycle

/** Frame index inside a player sheet: dirs × [idle, walk1..walk6], then dead, then ghost. */
export function playerFrame(dir: Dir, step: number): number {
  return DIRS.indexOf(dir) * STEPS_PER_DIR + step;
}
export const DEAD_FRAME = DIRS.length * STEPS_PER_DIR;
export const GHOST_FRAME = DIRS.length * STEPS_PER_DIR + 1;

export function playerKey(color: string): string {
  return `player-${color}`;
}

function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}
function shade(n: number, f: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return hex((r << 16) | (g << 8) | b);
}
function tintColor(n: number, t: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * t));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * t));
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * t));
  return hex((r << 16) | (g << 8) | b);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
): void {
  let tl: number, tr: number, br: number, bl: number;
  if (typeof r === "number") {
    tl = tr = br = bl = r;
  } else {
    [tl, tr, br, bl] = r;
  }
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

/**
 * Draw one high-res Among Us Crewmate frame at (ox, oy) in a 96×96 cell.
 * step: 0 = idle, 1..6 = 6-frame bouncy waddle walk cycle.
 */
function drawCrewmate(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  color: number,
  dir: Dir,
  step: number
): void {
  const base = hex(color);
  const dark = shade(color, 0.58);
  const midDark = shade(color, 0.76);
  const highlight = tintColor(color, 0.24);

  const walking = step > 0;
  const phase = walking ? ((step - 1) / 6) * Math.PI * 2 : 0;
  const stride = walking ? Math.sin(phase) : 0; // -1..+1
  const liftA = walking ? Math.max(0, -Math.cos(phase)) : 0;
  const liftB = walking ? Math.max(0, Math.cos(phase)) : 0;
  const bob = walking ? -Math.abs(Math.sin(phase)) * 5.5 : 0;
  const tilt = walking ? Math.sin(phase) * 0.055 : 0;

  const cx = ox + FRAME / 2;
  const groundY = oy + 82;

  ctx.save();

  // 0. Soft elliptical ground shadow
  const shadowScale = 1 - Math.abs(bob) * 0.015;
  const shadowGrad = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, 26 * shadowScale);
  shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.48)");
  shadowGrad.addColorStop(0.65, "rgba(0, 0, 0, 0.22)");
  shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, 25 * shadowScale, 8.5 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  const outlineWidth = 4.6;
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = "#080b11";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Helper to draw a swinging, rounded Crewmate leg
  const drawLeg = (lx: number, ly: number, swingX: number, liftY: number, angle: number, isBackLeg = false) => {
    ctx.save();
    ctx.translate(lx + swingX, ly - liftY);
    ctx.rotate(angle);

    const lw = 17;
    const lh = 22;
    roundRect(ctx, -lw / 2, 0, lw, lh, [4, 4, 8, 8]);
    ctx.fillStyle = dark;
    ctx.fill();

    ctx.save();
    roundRect(ctx, -lw / 2, 0, lw, lh, [4, 4, 8, 8]);
    ctx.clip();
    ctx.fillStyle = isBackLeg ? midDark : base;
    ctx.fillRect(-lw / 2, 0, lw, lh * 0.62);
    ctx.restore();

    roundRect(ctx, -lw / 2, 0, lw, lh, [4, 4, 8, 8]);
    ctx.stroke();
    ctx.restore();
  };

  const hipY = oy + 55 + bob * 0.6;

  // 1. Legs (drawn with natural stride swing)
  if (dir === "down" || dir === "up") {
    const swingA = stride * 2.5;
    const swingB = -stride * 2.5;
    drawLeg(cx - 11, hipY, swingA * 0.4, liftA * 6 + (stride > 0 ? stride * 3 : 0), stride * 0.08, false);
    drawLeg(cx + 11, hipY, swingB * 0.4, liftB * 6 + (stride < 0 ? -stride * 3 : 0), -stride * 0.08, false);
  } else if (dir === "left") {
    // Back leg first, then front leg
    drawLeg(cx + 4, hipY, -stride * 9, liftB * 6, stride * 0.28, true);
    drawLeg(cx - 6, hipY, stride * 9, liftA * 6, -stride * 0.28, false);
  } else {
    drawLeg(cx - 4, hipY, stride * 9, liftB * 6, -stride * 0.28, true);
    drawLeg(cx + 6, hipY, -stride * 9, liftA * 6, stride * 0.28, false);
  }

  // Apply torso bob + slight playful tilt
  ctx.save();
  ctx.translate(cx, oy + 40 + bob);
  ctx.rotate(tilt);

  // 2. Backpack (behind body for left/right)
  const packLag = walking ? -Math.cos(phase) * 1.8 : 0;
  if (dir === "left" || dir === "right") {
    const isLeft = dir === "left";
    const px = isLeft ? 12 : -28;
    const py = -12 + packLag;
    const pw = 16;
    const ph = 32;

    roundRect(ctx, px, py, pw, ph, 7);
    ctx.fillStyle = dark;
    ctx.fill();

    ctx.save();
    roundRect(ctx, px, py, pw, ph, 7);
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(px, py, pw, ph * 0.65);
    ctx.fillStyle = highlight;
    ctx.fillRect(px + 2, py + 2, pw - 4, 4);
    ctx.restore();

    roundRect(ctx, px, py, pw, ph, 7);
    ctx.stroke();
  }

  // 3. Main Bean Torso (smooth egg/bean curve with two-tone cel shading + crown highlight)
  const bw = dir === "left" || dir === "right" ? 42 : 44;
  const bh = 50;
  const bx = -bw / 2;
  const by = -26;

  const traceBean = () => {
    ctx.beginPath();
    // Crown of head -> right side -> bottom right -> underbelly -> bottom left -> left side
    ctx.moveTo(0, by);
    ctx.bezierCurveTo(bw * 0.48, by, bw * 0.52, by + bh * 0.35, bw * 0.5, by + bh * 0.78);
    ctx.quadraticCurveTo(bw * 0.5, by + bh, bw * 0.25, by + bh);
    ctx.lineTo(-bw * 0.25, by + bh);
    ctx.quadraticCurveTo(-bw * 0.5, by + bh, -bw * 0.5, by + bh * 0.78);
    ctx.bezierCurveTo(-bw * 0.52, by + bh * 0.35, -bw * 0.48, by, 0, by);
    ctx.closePath();
  };

  traceBean();
  ctx.fillStyle = dark;
  ctx.fill();

  ctx.save();
  traceBean();
  ctx.clip();

  // Lit area of the suit
  ctx.fillStyle = base;
  ctx.beginPath();
  if (dir === "left") {
    ctx.ellipse(-5, by + bh * 0.42, bw * 0.48, bh * 0.48, -0.1, 0, Math.PI * 2);
  } else if (dir === "right") {
    ctx.ellipse(5, by + bh * 0.42, bw * 0.48, bh * 0.48, 0.1, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, by + bh * 0.4, bw * 0.5, bh * 0.46, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // Crown specular highlight
  ctx.fillStyle = highlight;
  ctx.beginPath();
  const hx = dir === "left" ? -4 : dir === "right" ? 4 : 0;
  ctx.ellipse(hx, by + 7, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  traceBean();
  ctx.stroke();

  // Subtle underbelly seam line between the legs
  ctx.beginPath();
  ctx.lineWidth = 3.2;
  ctx.moveTo(-5, by + bh - 1);
  ctx.quadraticCurveTo(0, by + bh - 5, 5, by + bh - 1);
  ctx.stroke();
  ctx.lineWidth = outlineWidth;

  // 4. Backpack when facing UP (drawn on the back over the torso)
  if (dir === "up") {
    const pw = 30;
    const ph = 32;
    const px = -pw / 2;
    const py = -11 + packLag;

    roundRect(ctx, px, py, pw, ph, 8);
    ctx.fillStyle = dark;
    ctx.fill();

    ctx.save();
    roundRect(ctx, px, py, pw, ph, 8);
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(px, py, pw, ph * 0.68);
    ctx.fillStyle = highlight;
    ctx.fillRect(px + 4, py + 3, pw - 8, 4);
    ctx.restore();

    roundRect(ctx, px, py, pw, ph, 8);
    ctx.stroke();
  }

  // 5. Iconic 3D Bubble Visor (when not facing UP)
  if (dir !== "up") {
    let vx = 0;
    const vy = -14;
    let vw = 30;
    const vh = 20;
    if (dir === "left") {
      vx = -25;
      vw = 28;
    } else if (dir === "right") {
      vx = -3;
      vw = 28;
    } else {
      vx = -15;
      vw = 30;
    }

    // Visor shadow on suit underneath
    roundRect(ctx, vx + 1, vy + 3, vw, vh, 10);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fill();

    // Base dark slate visor fill
    roundRect(ctx, vx, vy, vw, vh, 10);
    ctx.fillStyle = "#3b596b";
    ctx.fill();

    // Inner cyan visor gradient/crescent
    ctx.save();
    roundRect(ctx, vx, vy, vw, vh, 10);
    ctx.clip();

    ctx.fillStyle = "#84dcf7";
    ctx.beginPath();
    const vcx = dir === "left" ? vx + vw * 0.42 : dir === "right" ? vx + vw * 0.58 : vx + vw * 0.5;
    ctx.ellipse(vcx, vy + vh * 0.38, vw * 0.52, vh * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glossy white top reflection oval
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const rx = dir === "left" ? vx + 9 : dir === "right" ? vx + vw - 9 : vx + vw - 10;
    ctx.ellipse(rx, vy + 6, 7.5, 3.6, dir === "left" ? -0.22 : 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Small catchlight dot
    ctx.beginPath();
    ctx.arc(dir === "left" ? rx + 8 : rx - 8, vy + 5.5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    roundRect(ctx, vx, vy, vw, vh, 10);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

/** High-res Dead Body: sliced lower half of suit with glossy 3D cartoon bone & blood pool. */
function drawCorpse(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number): void {
  const base = hex(color);
  const dark = shade(color, 0.58);
  const cx = ox + FRAME / 2;
  const cy = oy + 54;

  ctx.save();
  ctx.lineWidth = 4.4;
  ctx.strokeStyle = "#080b11";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Blood pool + droplets
  ctx.fillStyle = "#7a0918";
  ctx.beginPath();
  ctx.ellipse(cx - 2, cy + 16, 34, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a31224";
  ctx.beginPath();
  ctx.ellipse(cx - 4, cy + 15, 25, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs lying horizontally/angled
  for (const [lx, ly] of [[cx - 22, cy + 4], [cx + 6, cy + 6]]) {
    roundRect(ctx, lx, ly, 17, 18, [4, 4, 8, 8]);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.save();
    roundRect(ctx, lx, ly, 17, 18, [4, 4, 8, 8]);
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(lx, ly, 17, 10);
    ctx.restore();
    roundRect(ctx, lx, ly, 17, 18, [4, 4, 8, 8]);
    ctx.stroke();
  }

  // Lower torso half
  roundRect(ctx, cx - 25, cy - 12, 50, 24, [12, 12, 8, 8]);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.save();
  roundRect(ctx, cx - 25, cy - 12, 50, 24, [12, 12, 8, 8]);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(cx - 25, cy - 12, 50, 14);
  ctx.restore();
  roundRect(ctx, cx - 25, cy - 12, 50, 24, [12, 12, 8, 8]);
  ctx.stroke();

  // Sliced interior cross-section
  ctx.fillStyle = "#b71c1c";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 10, 19, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 10, 13, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cartoon 3D bone sticking up
  const bx = cx;
  const by = cy - 12;
  ctx.fillStyle = "#f8f6f0";
  ctx.beginPath();
  ctx.moveTo(bx - 5, by + 3);
  ctx.lineTo(bx - 5, by - 14);
  ctx.arc(bx - 5, by - 17, 5.5, Math.PI * 0.3, Math.PI * 1.8);
  ctx.arc(bx + 5, by - 17, 5.5, Math.PI * 1.2, Math.PI * 0.7);
  ctx.lineTo(bx + 5, by + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** High-res Ghost frame: floating translucent crewmate with swirling ectoplasm tail. */
function drawGhost(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number): void {
  const base = hex(color);
  const dark = shade(color, 0.65);
  const highlight = tintColor(color, 0.3);
  const cx = ox + FRAME / 2;
  const top = oy + 12;

  ctx.save();
  ctx.lineWidth = 4.4;
  ctx.strokeStyle = "#080b11";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Backpack
  roundRect(ctx, cx - 28, top + 14, 14, 26, 6);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.stroke();

  // Ghost body + wavy ectoplasm tail
  const traceGhost = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 20, top + 22);
    ctx.bezierCurveTo(cx - 20, top - 2, cx + 20, top - 2, cx + 20, top + 22);
    ctx.lineTo(cx + 20, top + 52);
    ctx.quadraticCurveTo(cx + 14, top + 66, cx + 6, top + 55);
    ctx.quadraticCurveTo(cx, top + 47, cx - 6, top + 59);
    ctx.quadraticCurveTo(cx - 14, top + 68, cx - 20, top + 52);
    ctx.closePath();
  };

  traceGhost();
  ctx.fillStyle = dark;
  ctx.fill();

  ctx.save();
  traceGhost();
  ctx.clip();
  ctx.fillStyle = base;
  ctx.ellipse(cx + 2, top + 24, 20, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.ellipse(cx, top + 8, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  traceGhost();
  ctx.stroke();

  // Ghost visor
  const vx = cx - 8;
  const vy = top + 11;
  roundRect(ctx, vx, vy, 26, 18, 9);
  ctx.fillStyle = "#8ce0ff";
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(vx + 17, vy + 5.5, 6, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** One high-res spritesheet per colour: 4 dirs × 7 poses + 1 dead frame + 1 ghost frame. */
export function generatePlayerTextures(scene: Phaser.Scene): void {
  const frames = DIRS.length * STEPS_PER_DIR + 2;
  for (const [color, value] of Object.entries(PLAYER_COLORS)) {
    const key = playerKey(color);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, FRAME * frames, FRAME)!;
    const ctx = tex.getContext();
    let i = 0;
    for (const dir of DIRS) {
      for (let step = 0; step < STEPS_PER_DIR; step++) {
        drawCrewmate(ctx, i * FRAME, 0, value, dir, step);
        tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
        i++;
      }
    }
    drawCorpse(ctx, i * FRAME, 0, value);
    tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
    i++;
    drawGhost(ctx, i * FRAME, 0, value);
    tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

export function createPlayerAnimations(scene: Phaser.Scene): void {
  for (const color of Object.keys(PLAYER_COLORS)) {
    const key = playerKey(color);
    for (const dir of DIRS) {
      if (!scene.anims.exists(`${key}-idle-${dir}`)) {
        scene.anims.create({
          key: `${key}-idle-${dir}`,
          frames: [{ key, frame: playerFrame(dir, 0) }],
          frameRate: 1,
        });
      }
      if (!scene.anims.exists(`${key}-walk-${dir}`)) {
        scene.anims.create({
          key: `${key}-walk-${dir}`,
          frames: [
            { key, frame: playerFrame(dir, 1) },
            { key, frame: playerFrame(dir, 2) },
            { key, frame: playerFrame(dir, 3) },
            { key, frame: playerFrame(dir, 4) },
            { key, frame: playerFrame(dir, 5) },
            { key, frame: playerFrame(dir, 6) },
          ],
          frameRate: 15,
          repeat: -1,
        });
      }
    }
  }
}

/** Static markers & interactive consoles rendered at 2× resolution for crispness. */
export function generateMarkerTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("task-marker")) {
    const tex = scene.textures.createCanvas("task-marker", 56, 56)!;
    const ctx = tex.getContext();

    // Outer yellow glow
    const glow = ctx.createRadialGradient(28, 28, 8, 28, 28, 27);
    glow.addColorStop(0, "rgba(255, 209, 102, 0.45)");
    glow.addColorStop(1, "rgba(255, 209, 102, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 56, 56);

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd166";
    ctx.fillStyle = "#1e293b";
    roundRect(ctx, 8, 10, 40, 36, 7);
    ctx.fill();
    ctx.stroke();

    // Terminal screen
    ctx.fillStyle = "#063b2d";
    roundRect(ctx, 13, 15, 30, 18, 4);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#06d6a0";
    ctx.stroke();

    // Screen waveform / bars
    ctx.fillStyle = "#06d6a0";
    ctx.fillRect(17, 19, 14, 3);
    ctx.fillRect(17, 25, 21, 3);

    // Status LEDs
    for (const [bx, col] of [[15, "#ef476f"], [25, "#ffd166"], [35, "#38bdf8"]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(bx + 2, 39, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("task-arrow")) {
    const tex = scene.textures.createCanvas("task-arrow", 36, 28)!;
    const ctx = tex.getContext();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#080b11";
    ctx.lineJoin = "round";

    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(32, 4);
    ctx.lineTo(18, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("sabotage-marker")) {
    const tex = scene.textures.createCanvas("sabotage-marker", 60, 60)!;
    const ctx = tex.getContext();

    const glow = ctx.createRadialGradient(30, 30, 8, 30, 30, 29);
    glow.addColorStop(0, "rgba(255, 77, 109, 0.6)");
    glow.addColorStop(1, "rgba(255, 77, 109, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 60, 60);

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#ff4d6d";
    ctx.fillStyle = "#3b0d16";
    roundRect(ctx, 10, 10, 40, 40, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 30, 31);

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("monitor")) {
    const tex = scene.textures.createCanvas("monitor", 60, 56)!;
    const ctx = tex.getContext();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#080b11";

    // Pedestal stand
    ctx.fillStyle = "#475569";
    roundRect(ctx, 23, 38, 14, 12, 3);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 14, 46, 32, 7, 3);
    ctx.fill();
    ctx.stroke();

    // Monitor bezel
    ctx.fillStyle = "#1e293b";
    roundRect(ctx, 4, 4, 52, 38, 6);
    ctx.fill();
    ctx.stroke();

    // Glowing screen
    ctx.fillStyle = "#082f49";
    roundRect(ctx, 9, 9, 42, 28, 4);
    ctx.fill();
    ctx.stroke();

    // Quad security feed tiles
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(12, 12, 16, 10);
    ctx.fillRect(32, 12, 16, 10);
    ctx.fillRect(12, 24, 16, 10);
    ctx.fillRect(32, 24, 16, 10);

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("vent")) {
    const tex = scene.textures.createCanvas("vent", 64, 48)!;
    const ctx = tex.getContext();

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, 4, 6, 56, 38, 7);
    ctx.fill();

    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "#080b11";
    ctx.fillStyle = "#64748b";
    roundRect(ctx, 4, 4, 56, 38, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    roundRect(ctx, 10, 10, 44, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Metallic louvers
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    for (let y = 16; y <= 30; y += 7) {
      ctx.moveTo(14, y);
      ctx.lineTo(50, y);
    }
    ctx.stroke();

    // Corner rivets
    ctx.fillStyle = "#cbd5e1";
    for (const [rx, ry] of [[8, 8], [56, 8], [8, 38], [56, 38]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("emergency-button")) {
    const tex = scene.textures.createCanvas("emergency-button", 128, 128)!;
    const ctx = tex.getContext();

    // Floor shadow
    const sh = ctx.createRadialGradient(64, 68, 10, 64, 68, 58);
    sh.addColorStop(0, "rgba(0,0,0,0.55)");
    sh.addColorStop(0.8, "rgba(0,0,0,0.25)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(64, 68, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#080b11";

    // Outer table rim
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner metallic table surface
    const surfGrad = ctx.createRadialGradient(54, 52, 6, 64, 64, 46);
    surfGrad.addColorStop(0, "#64748b");
    surfGrad.addColorStop(1, "#475569");
    ctx.fillStyle = surfGrad;
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Yellow hazard box in center
    ctx.fillStyle = "#eab308";
    roundRect(ctx, 42, 42, 44, 44, 8);
    ctx.fill();
    ctx.stroke();

    // Glass/metal dome ring
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(64, 64, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Red emergency button
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(64, 62, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Specular shine
    ctx.fillStyle = "#fecaca";
    ctx.beginPath();
    ctx.ellipse(60, 58, 4.5, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  if (!scene.textures.exists("darkness")) {
    const size = 512;
    const tex = scene.textures.createCanvas("darkness", size, size)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.075);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0.95)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

/**
 * Generates an inline SVG string of an Among Us crewmate for DOM UI
 * (Lobby list, Meeting vote cards, Cameras, Ejection animation).
 */
export function createCrewmateSvg(colorHex: string, opts?: { size?: number; dead?: boolean }): string {
  const size = opts?.size ?? 28;
  if (opts?.dead) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="crewmate-icon dead">
      <ellipse cx="32" cy="54" rx="22" ry="6" fill="#7a0918"/>
      <path d="M28 28 V14 A4 4 0 1 1 32 10 A4 4 0 1 1 36 14 V28 Z" fill="#f8f6f0" stroke="#080b11" stroke-width="3.5"/>
      <rect x="16" y="40" width="12" height="14" rx="5" fill="${colorHex}" stroke="#080b11" stroke-width="3.5"/>
      <rect x="36" y="40" width="12" height="14" rx="5" fill="${colorHex}" stroke="#080b11" stroke-width="3.5"/>
      <rect x="14" y="26" width="36" height="18" rx="8" fill="${colorHex}" stroke="#080b11" stroke-width="3.5"/>
      <ellipse cx="32" cy="28" rx="13" ry="4.5" fill="#c62828" stroke="#080b11" stroke-width="2.5"/>
    </svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="crewmate-icon">
    <ellipse cx="33" cy="58" rx="16" ry="4.5" fill="rgba(0,0,0,0.35)"/>
    <rect x="9" y="20" width="12" height="24" rx="6" fill="${colorHex}" stroke="#080b11" stroke-width="3.8"/>
    <rect x="19" y="42" width="11" height="15" rx="5" fill="${colorHex}" stroke="#080b11" stroke-width="3.8"/>
    <rect x="35" y="42" width="11" height="15" rx="5" fill="${colorHex}" stroke="#080b11" stroke-width="3.8"/>
    <path d="M17 26 C17 10, 49 10, 49 26 L49 42 C49 46, 45 47, 41 47 L25 47 C21 47, 17 46, 17 42 Z" fill="${colorHex}" stroke="#080b11" stroke-width="3.8"/>
    <rect x="27" y="16" width="24" height="15" rx="7.5" fill="#84dcf7" stroke="#080b11" stroke-width="3.5"/>
    <ellipse cx="41" cy="20.5" rx="5" ry="2.3" fill="#ffffff"/>
  </svg>`;
}
