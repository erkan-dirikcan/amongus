// Generates tileset.png (4 tiles) + player.png (8-frame spritesheet) + tileset.json
// Uses the `canvas` npm package.
// Run: node scripts/generate-sprites.mjs

import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TS = 32; // tile size

// ─── Tileset PNG (4 tiles in a row: empty, wall, floor, room, spawn) ────
const tilesetCanvas = createCanvas(TS * 5, TS);
const tctx = tilesetCanvas.getContext("2d");

// Tile 0: empty (transparent)
tctx.clearRect(0, 0, TS, TS);

// Tile 1: wall (dark gray)
tctx.fillStyle = "#2a2a3e";
tctx.fillRect(TS * 1, 0, TS, TS);
tctx.strokeStyle = "#1a1a2e";
tctx.lineWidth = 2;
tctx.strokeRect(TS * 1 + 1, 1, TS - 2, TS - 2);

// Tile 2: corridor floor (medium gray)
tctx.fillStyle = "#4a4a5e";
tctx.fillRect(TS * 2, 0, TS, TS);

// Tile 3: room floor (blue-gray)
tctx.fillStyle = "#3a5a8c";
tctx.fillRect(TS * 3, 0, TS, TS);

// Tile 4: spawn (yellow tint)
tctx.fillStyle = "#c9a227";
tctx.fillRect(TS * 4, 0, TS, TS);

const tilesetPath = resolve(__dirname, "../../client/public/assets/tileset.png");
mkdirSync(dirname(tilesetPath), { recursive: true });
writeFileSync(tilesetPath, tilesetCanvas.toBuffer("image/png"));
console.log("[OK] tileset.png written");

// ─── Tileset JSON (Tiled format) ───────────────────────────────────────
const tilesetJson = {
  columns: 5,
  image: "tileset.png",
  imageheight: 32,
  imagewidth: 160,
  margin: 0,
  name: "tileset",
  spacing: 0,
  tilecount: 5,
  tileheight: 32,
  tilewidth: 32,
  tiles: [
    { id: 0, properties: [] },
    { id: 1, properties: [{ name: "collides", type: "bool", value: true }] },
    { id: 2, properties: [] },
    { id: 3, properties: [] },
    { id: 4, properties: [] },
  ],
};
const tilesetJsonPath = resolve(__dirname, "../../client/public/assets/tileset.json");
writeFileSync(tilesetJsonPath, JSON.stringify(tilesetJson, null, 2));
console.log("[OK] tileset.json written");

// ─── Player spritesheet (8 frames: 4 directions × 2 anim frames) ───────
// Layout: 4 columns (down, up, left, right), 2 rows (idle, walk)
const playerCanvas = createCanvas(TS * 4, TS * 2);
const pctx = playerCanvas.getContext("2d");

function drawBean(ctx, x, y, animFrame, direction) {
  // Body: white ellipse (bean shape) — tint applied in Phaser
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(x + TS / 2, y + TS / 2 + 2, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Backpack (small bump on back)
  ctx.beginPath();
  const bpOffset = direction === "right" ? -7 : 7;
  ctx.ellipse(x + TS / 2 + bpOffset, y + TS / 2 + 2, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (walk animation)
  ctx.fillStyle = "#ffffff";
  const legOffset = animFrame === 1 ? 2 : 0;
  ctx.fillRect(x + TS / 2 - 6, y + TS - 6 + legOffset, 4, 4);
  ctx.fillRect(x + TS / 2 + 2, y + TS - 6 - legOffset, 4, 4);

  // Visor (eyes area)
  ctx.fillStyle = "#aaccff";
  ctx.beginPath();
  const visorX = direction === "left" ? x + TS / 2 - 3 : direction === "right" ? x + TS / 2 + 1 : x + TS / 2 - 1;
  ctx.ellipse(visorX, y + TS / 2 - 2, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye detail
  ctx.fillStyle = "#1a1a2e";
  if (direction === "down" || direction === "up") {
    ctx.fillRect(visorX - 2, y + TS / 2 - 3, 2, 2);
    ctx.fillRect(visorX + 1, y + TS / 2 - 3, 2, 2);
  } else if (direction === "left") {
    ctx.fillRect(visorX - 3, y + TS / 2 - 3, 2, 2);
  } else {
    ctx.fillRect(visorX + 1, y + TS / 2 - 3, 2, 2);
  }
}

const directions = ["down", "up", "left", "right"];
for (let d = 0; d < 4; d++) {
  drawBean(pctx, d * TS, 0, 0, directions[d]);      // idle (row 0)
  drawBean(pctx, d * TS, TS, 1, directions[d]);     // walk (row 1)
}

const playerPath = resolve(__dirname, "../../client/public/assets/player.png");
writeFileSync(playerPath, playerCanvas.toBuffer("image/png"));
console.log("[OK] player.png written");
