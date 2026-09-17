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

// Tile 0: empty (transparent)
ctx.clearRect(0, 0, TS, TS);

// Tile 1: wall — dark hull plate with a lit top edge and rivets
{
  const x = TS * 1;
  ctx.fillStyle = "#151a26";
  ctx.fillRect(x, 0, TS, TS);
  ctx.fillStyle = "#2a3242";
  ctx.fillRect(x + 1, 1, TS - 2, TS - 2);
  ctx.fillStyle = "#3d475c"; // top highlight
  ctx.fillRect(x + 1, 1, TS - 2, 3);
  ctx.fillStyle = "#1c2230"; // bottom shadow
  ctx.fillRect(x + 1, TS - 4, TS - 2, 3);
  ctx.fillStyle = "#4a5570"; // rivets
  for (const [rx, ry] of [[5, 8], [26, 8], [5, 24], [26, 24]]) ctx.fillRect(x + rx, ry, 2, 2);
  ctx.fillStyle = "#222a3a"; // panel seam
  ctx.fillRect(x + 15, 5, 2, TS - 10);
}

// Tile 2: corridor — grey metal plating with seams
{
  const x = TS * 2;
  ctx.fillStyle = "#4b5263";
  ctx.fillRect(x, 0, TS, TS);
  ctx.fillStyle = "#3f4657";
  ctx.fillRect(x, 0, TS, 1);
  ctx.fillRect(x, 0, 1, TS);
  ctx.fillStyle = "#565e70";
  ctx.fillRect(x + 1, 1, TS - 2, 1);
  ctx.fillRect(x + 1, 1, 1, TS - 2);
  ctx.fillStyle = "#434a5b";
  ctx.fillRect(x + 16, 0, 1, TS);
  ctx.fillRect(x, 16, TS, 1);
  speckle(x, 0, ["#525a6c", "#454c5d"], 40);
}

// Tile 3: room floor — blue-grey tiles with grout
{
  const x = TS * 3;
  ctx.fillStyle = "#2f4a6b";
  ctx.fillRect(x, 0, TS, TS);
  ctx.fillStyle = "#3a5a80";
  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) ctx.fillRect(x + tx, ty, 14, 14);
  ctx.fillStyle = "#44699a";
  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) ctx.fillRect(x + tx, ty, 14, 1);
  speckle(x, 0, ["#3f6189", "#35547a"], 30);
}

// Tile 4: cafeteria floor — warm, so the spawn room reads differently
{
  const x = TS * 4;
  ctx.fillStyle = "#7a6238";
  ctx.fillRect(x, 0, TS, TS);
  ctx.fillStyle = "#8f7443";
  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) ctx.fillRect(x + tx, ty, 14, 14);
  ctx.fillStyle = "#a3854d";
  for (const [tx, ty] of [[1, 1], [17, 1], [1, 17], [17, 17]]) ctx.fillRect(x + tx, ty, 14, 1);
  speckle(x, 0, ["#977b48", "#84693c"], 30);
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
