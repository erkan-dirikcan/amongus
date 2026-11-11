// Generates a Tiled-format JSON map + exports wallGrid as TS.
// Run: node scripts/generate-map.mjs
// Outputs: packages/client/public/assets/map.json

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;

// Tile IDs: 0=empty, 1=wall, 2=floor(corridor), 3=floor(room), 4=spawn
const TILE = { EMPTY: 0, WALL: 1, FLOOR_CORRIDOR: 2, FLOOR_ROOM: 3, SPAWN: 4 };
const FIRST_GID = 1;

// Initialize grid with walls
const ground = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(TILE.WALL));
const walls = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(0));
const wallGrid = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(true));

// Helper: fill a rectangular room with floor
function fillRoom(grid, x, y, w, h, tile) {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
        grid[r][c] = tile;
      }
    }
  }
}

// Helper: carve a horizontal corridor
function corridorH(grid, x1, x2, y, tile = TILE.FLOOR_CORRIDOR) {
  const [start, end] = x1 < x2 ? [x1, x2] : [x2, x1];
  for (let c = start; c <= end; c++) {
    if (y >= 0 && y < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
      grid[y][c] = tile;
      if (y + 1 < MAP_HEIGHT) grid[y + 1][c] = tile;
    }
  }
}

// Helper: carve a vertical corridor
function corridorV(grid, y1, y2, x, tile = TILE.FLOOR_CORRIDOR) {
  const [start, end] = y1 < y2 ? [y1, y2] : [y2, y1];
  for (let r = start; r <= end; r++) {
    if (r >= 0 && r < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
      grid[r][x] = tile;
      if (x + 1 < MAP_WIDTH) grid[r][x + 1] = tile;
    }
  }
}

// Define rooms: [name, x, y, width, height]
const rooms = [
  ["cafeteria", 20, 20, 10, 10],   // center (spawn)
  ["medbay", 20, 12, 10, 6],       // above cafeteria
  ["weapons", 35, 18, 8, 6],
  ["navigation", 38, 28, 6, 8],
  ["o2", 35, 40, 6, 6],
  ["reactor", 6, 40, 8, 6],
  ["electrical", 5, 28, 8, 8],
  ["storage", 5, 18, 8, 6],
  ["admin", 22, 40, 8, 6],
];

// Fill rooms
for (const [name, x, y, w, h] of rooms) {
  fillRoom(ground, x, y, w, h, name === "cafeteria" ? TILE.SPAWN : TILE.FLOOR_ROOM);
}

// Connect rooms with corridors (horizontal/vertical). Every room must be
// reachable on foot from the cafeteria spawn — the generator asserts this
// below, so a missing corridor fails loudly instead of silently stranding
// tasks and vents in an unreachable room.
// Cafeteria center ~ (25, 25)
corridorH(ground, 20, 35, 22); // cafeteria → weapons (main hallway)
corridorV(ground, 20, 40, 24); // medbay → cafeteria → admin (central spine)
corridorV(ground, 28, 40, 26); // widen the spine to admin
corridorV(ground, 17, 20, 24); // medbay → cafeteria
corridorH(ground, 13, 20, 20); // storage → cafeteria
corridorH(ground, 26, 38, 30); // central spine → navigation
corridorV(ground, 23, 28, 40); // weapons → navigation
corridorV(ground, 23, 28, 8);  // storage → electrical
corridorV(ground, 35, 40, 9);  // electrical → reactor
corridorH(ground, 13, 22, 42); // reactor → admin
corridorH(ground, 29, 35, 42); // admin → o2
corridorV(ground, 36, 39, 40); // navigation → o2

// Compute walls: server wallGrid marks every non-floor tile as solid;
// client visual `walls` layer only draws hull bulkhead tiles adjacent (within 1 tile)
// to a walkable floor tile so the outer void lets the space starfield show through.
function hasNearbyFloor(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH) {
        if (ground[nr][nc] !== TILE.WALL) return true;
      }
    }
  }
  return false;
}

for (let r = 0; r < MAP_HEIGHT; r++) {
  for (let c = 0; c < MAP_WIDTH; c++) {
    const isSolid = ground[r][c] === TILE.WALL;
    wallGrid[r][c] = isSolid;
    walls[r][c] = isSolid && hasNearbyFloor(r, c) ? 1 : 0;
  }
}

// Sanity check: flood-fill from spawn and require every room tile to be reachable
{
  const seen = new Set(["25,25"]);
  const queue = [[25, 25]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (wallGrid[ny]?.[nx] === false && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  const stranded = rooms.filter(([, x, y, w, h]) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (!seen.has(`${c},${r}`)) return true;
    return false;
  }).map(([name]) => name);
  if (stranded.length) {
    console.error("[FAIL] rooms not fully reachable from spawn:", stranded.join(", "));
    process.exit(1);
  }
  console.log(`[OK] all ${rooms.length} rooms reachable (${seen.size} walkable tiles)`);
}

// Build Tiled JSON
const tiledMap = {
  compressionlevel: -1,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tilewidth: 32,
  tileheight: 32,
  orientation: "orthogonal",
  renderorder: "right-down",
  // Phaser does not support external tilesets ("source": "tileset.json") —
  // it logs "External tilesets unsupported" and addTilesetImage() returns
  // null, so nothing renders. Embed the tileset definition instead.
  tilesets: [
    {
      firstgid: FIRST_GID,
      ...JSON.parse(readFileSync(resolve(__dirname, "../../client/public/assets/tileset.json"), "utf8")),
    },
  ],
  layers: [
    {
      name: "Ground",
      type: "tilelayer",
      // Tiled gids = tileset tile index + firstgid (1); gid 0 = no tile.
      // Tileset order (generate-sprites.mjs): 0 empty, 1 wall, 2 corridor, 3 room, 4 spawn.
      data: ground.flat().map((t) => (t === TILE.WALL ? 0 : t + FIRST_GID)),
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      visible: true,
      opacity: 1,
    },
    {
      name: "Walls",
      type: "tilelayer",
      data: walls.flat().map((w) => (w ? TILE.WALL + FIRST_GID : 0)),
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      visible: true,
      opacity: 1,
    },
  ],
};

const outputPath = resolve(__dirname, "../../client/public/assets/map.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(tiledMap, null, 2));
console.log("[OK] Map written to", outputPath);

// Also write wallGrid as TS (for server collision)
const wallGridTs = `// AUTO-GENERATED by scripts/generate-map.mjs — do not edit
export const MAP_WIDTH = ${MAP_WIDTH};
export const MAP_HEIGHT = ${MAP_HEIGHT};
export const WALL_GRID: boolean[][] = ${JSON.stringify(wallGrid)};
export const SPAWN_CENTER = { x: 25, y: 25 };
`;
const tsOutputPath = resolve(__dirname, "../src/game/mapData.ts");
writeFileSync(tsOutputPath, wallGridTs);
console.log("[OK] mapData.ts written to", tsOutputPath);
