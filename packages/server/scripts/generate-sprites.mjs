// Generates tileset.png (5 tiles) + tileset.json for the client.
// Player sprites and map markers are drawn in the browser (client/src/phaser/sprites.ts).
// Uses the `canvas` npm package.
// Run: node scripts/generate-sprites.mjs   (then node scripts/generate-map.mjs to re-embed)

import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TS = 32; // tile size

// Tile order must match generate-map.mjs: 0 empty, 1 wall, 2 corridor, 3 room, 4 spawn(cafeteria)
const tilesetCanvas = createCanvas(TS * 5, TS);
const ctx = tilesetCanvas.getContext("2d");

// Deterministic speckle so floors are not flat
let seed = 7;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function speckle(x, y, colors, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x + Math.floor(rnd() * TS), y + Math.floor(rnd() * TS), 1, 1);
  }
}

// Tile 0: empty (transparent — lets the starfield show through)
ctx.clearRect(0, 0, TS, TS);

// Tile 1: wall — deep spacecraft bulkhead with 3D bevel, baseboard, and subtle tech trim
{
  const x = TS * 1;
  // Outer dark frame
  ctx.fillStyle = "#0f141f";
  ctx.fillRect(x, 0, TS, TS);

  // Main bulkhead body
  ctx.fillStyle = "#1e2638";
  ctx.fillRect(x + 1, 1, TS - 2, TS - 2);

  // Upper lit bevel
  ctx.fillStyle = "#394663";
  ctx.fillRect(x + 1, 1, TS - 2, 4);
  ctx.fillStyle = "#4d5e82";
  ctx.fillRect(x + 2, 1, TS - 4, 2);

  // Recessed center panel
  ctx.fillStyle = "#171e2e";
  ctx.fillRect(x + 4, 7, TS - 8, TS - 14);
  ctx.fillStyle = "#253047";
  ctx.fillRect(x + 5, 8, TS - 10, TS - 16);

  // Subtle cyan status strip in the panel
  ctx.fillStyle = "#2b4c66";
  ctx.fillRect(x + 7, 14, TS - 14, 2);

  // Lower baseboard shadow
  ctx.fillStyle = "#121722";
  ctx.fillRect(x + 1, TS - 5, TS - 2, 4);

  // Corner bolts / rivets
  ctx.fillStyle = "#56688f";
  for (const [rx, ry] of [[3, 3], [27, 3], [3, 27], [27, 27]]) {
    ctx.fillRect(x + rx, ry, 2, 2);
  }
}

// Tile 2: corridor — industrial steel walkway with grating & seam lines
{
  const x = TS * 2;
  ctx.fillStyle = "#464e5e";
  ctx.fillRect(x, 0, TS, TS);

  // Subtle border bevel
  ctx.fillStyle = "#555f73";
  ctx.fillRect(x, 0, TS, 2);
  ctx.fillRect(x, 0, 2, TS);
  ctx.fillStyle = "#373e4c";
  ctx.fillRect(x, TS - 2, TS, 2);
  ctx.fillRect(x + TS - 2, 0, 2, TS);

  // Grating ribs
  ctx.fillStyle = "#3d4454";
  for (let gy = 5; gy < TS - 4; gy += 5) {
    ctx.fillRect(x + 4, gy, 10, 2);
    ctx.fillRect(x + 18, gy, 10, 2);
  }

  // Center seam
  ctx.fillStyle = "#353b49";
  ctx.fillRect(x + 15, 0, 2, TS);
  ctx.fillRect(x, 15, TS, 2);
  speckle(x, 0, ["#4f586b", "#404757"], 25);
}

// Tile 3: room floor — clean spacecraft deck plating (blue-slate tiles)
{
  const x = TS * 3;
  ctx.fillStyle = "#2b3f5c";
  ctx.fillRect(x, 0, TS, TS);

  // 2x2 sub-panels
  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) {
    ctx.fillStyle = "#354d70";
    ctx.fillRect(x + tx, ty, 14, 14);
    // Top-left highlight
    ctx.fillStyle = "#425f8a";
    ctx.fillRect(x + tx, ty, 14, 1);
    ctx.fillRect(x + tx, ty, 1, 14);
    // Bottom-right shadow
    ctx.fillStyle = "#263852";
    ctx.fillRect(x + tx, ty + 13, 14, 1);
    ctx.fillRect(x + tx + 13, ty, 1, 14);
    // Tiny corner rivet
    ctx.fillStyle = "#4e6e9e";
    ctx.fillRect(x + tx + 2, ty + 2, 1, 1);
    ctx.fillRect(x + tx + 11, ty + 11, 1, 1);
  }
  speckle(x, 0, ["#395378", "#304666"], 18);
}

// Tile 4: cafeteria floor — warm spacecraft canteen deck tiles
{
  const x = TS * 4;
  ctx.fillStyle = "#4a453b";
  ctx.fillRect(x, 0, TS, TS);

  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) {
    ctx.fillStyle = "#5c5548";
    ctx.fillRect(x + tx, ty, 14, 14);
    ctx.fillStyle = "#6e6657";
    ctx.fillRect(x + tx, ty, 14, 1);
    ctx.fillRect(x + tx, ty, 1, 14);
    ctx.fillStyle = "#3d3830";
    ctx.fillRect(x + tx, ty + 13, 14, 1);
    ctx.fillRect(x + tx + 13, ty, 1, 14);
    // Subtle inner diamond/square accent
    ctx.fillStyle = "#635c4e";
    ctx.fillRect(x + tx + 4, ty + 4, 6, 6);
  }
  speckle(x, 0, ["#665e50", "#524c40"], 18);
}

const tilesetPath = resolve(__dirname, "../../client/public/assets/tileset.png");
mkdirSync(dirname(tilesetPath), { recursive: true });
writeFileSync(tilesetPath, tilesetCanvas.toBuffer("image/png"));
console.log("[OK] tileset.png written");

// ─── Tileset JSON (Tiled format) ───────────────────────────────────────
const tilesetJson = {
  columns: 5,
  image: "tileset.png",
  imageheight: TS,
  imagewidth: TS * 5,
  margin: 0,
  name: "tileset",
  spacing: 0,
  tilecount: 5,
  tileheight: TS,
  tilewidth: TS,
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
