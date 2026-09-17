import { describe, it, expect } from "vitest";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "../src/game/mapData.js";
import { TASK_LOCATIONS } from "../src/game/tasks.js";
import { VENT_POSITIONS } from "../src/game/vents.js";

/** Tiles reachable on foot (4-neighbour flood fill) from a start tile. */
function reachableFrom(x0: number, y0: number): Set<string> {
  const seen = new Set([`${x0},${y0}`]);
  const queue = [[x0, y0]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (WALL_GRID[ny]?.[nx] === false && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe("map data", () => {
  it("has correct dimensions", () => {
    expect(MAP_WIDTH).toBe(50);
    expect(MAP_HEIGHT).toBe(50);
  });

  it("wallGrid matches dimensions", () => {
    expect(WALL_GRID.length).toBe(50);
    expect(WALL_GRID[0].length).toBe(50);
  });

  it("spawn center is in cafeteria (not a wall)", () => {
    expect(WALL_GRID[SPAWN_CENTER.y][SPAWN_CENTER.x]).toBe(false);
  });

  it("borders are walls", () => {
    for (let i = 0; i < 50; i++) {
      expect(WALL_GRID[0][i]).toBe(true);   // top edge
      expect(WALL_GRID[49][i]).toBe(true);  // bottom edge
      expect(WALL_GRID[i][0]).toBe(true);   // left edge
      expect(WALL_GRID[i][49]).toBe(true);  // right edge
    }
  });

  it("has walkable area in center (cafeteria)", () => {
    // Cafeteria is roughly 20-30 in both axes
    let walkable = 0;
    for (let y = 20; y < 30; y++) {
      for (let x = 20; x < 30; x++) {
        if (!WALL_GRID[y][x]) walkable++;
      }
    }
    expect(walkable).toBeGreaterThan(50); // cafeteria should have lots of floor
  });

  it("has medbay room above cafeteria, connected by a corridor", () => {
    // Medbay: x 20-29, y 12-17 — fully walkable
    for (let y = 12; y < 18; y++) {
      for (let x = 20; x < 30; x++) {
        expect(WALL_GRID[y][x]).toBe(false);
      }
    }
    // Corridor from medbay down to cafeteria at x=24
    for (let y = 18; y < 20; y++) {
      expect(WALL_GRID[y][24]).toBe(false);
      expect(WALL_GRID[y][25]).toBe(false);
    }
  });

  it("medbay monitor and scan task tiles are walkable", () => {
    // Vitals monitor (27,15) and medbayScan task (22,15)
    expect(WALL_GRID[15][27]).toBe(false);
    expect(WALL_GRID[15][22]).toBe(false);
  });

  // Regression: the generated map once left electrical, navigation, reactor and
  // o2 with no corridor, stranding 6/16 tasks and 4/5 vents — crew could never
  // finish tasks. Every point of interest must be walkable from spawn.
  it("every task location is reachable on foot from spawn", () => {
    const reachable = reachableFrom(SPAWN_CENTER.x, SPAWN_CENTER.y);
    const stranded = TASK_LOCATIONS.filter((t) => !reachable.has(`${t.x},${t.y}`));
    expect(stranded.map((t) => `${t.room}:${t.type}@(${t.x},${t.y})`)).toEqual([]);
  });

  it("every vent is reachable on foot from spawn", () => {
    const reachable = reachableFrom(SPAWN_CENTER.x, SPAWN_CENTER.y);
    const stranded = VENT_POSITIONS.filter((v) => !reachable.has(`${v.x},${v.y}`));
    expect(stranded.map((v) => v.id)).toEqual([]);
  });
});
