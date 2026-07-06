# Sub-project 3: Oyun Çekirdeği — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lobiden "BAŞLAT" ile çıkıp haritada yürünen, rollerin dağıtıldığı, sunucu otoriteri realtime hareket içeren oyun çekirdeği. Oyuncular WASD ile yürür, birbirlerini haritada görür, sadece kendi rollerini bilir.

**Architecture:** Backend'e GameEngine eklenir (in-memory `Map<matchId, GameState>`, 20Hz tick döngüsü). Prisma'ya Match/MatchPlayer modelleri eklenir. Tilemap + sprite PNG'leri programmatic olarak üretilir (Tiled JSON formatında). Client'a Phaser GameScene eklenir (tilemap render, WASD input, interpolasyon, sprite animasyon).

**Tech Stack:** Phaser 3.80 (client), socket.io (mevcut), Prisma (mevcut), canvas npm (PNG üretimi), vitest (test).

## Global Constraints

- Node.js v24+, TypeScript strict mode, ESM with .js imports
- All code in English, conventional commits, master branch workflow
- Sunucu otoriteri: istemci input gönderir, sunucu pozisyonu hesaplar
- 20Hz tick rate (50ms), client interpolasyon
- Tile size: 32×32 pixels, map: 50×50 tiles
- PLAYER_SPEED = 3.0 tiles/sec, DIAGONAL_FACTOR = 1/√2
- Roller gizli: her oyuncu sadece kendi rolünü bilir
- TDD where applicable (GameEngine logic, rol dağılımı, harita üretimi)
- Phaser loaded as ESM via Vite

---

## File Structure (Sub-project 3 sonundaki durum)

```
amongus/
├── packages/
│   ├── shared/src/
│   │   ├── constants.ts        # +PLAYER_SPEED, TICK_RATE, getImpostorCount, TILE_SIZE
│   │   ├── types.ts            # +GameStartedPayload, TickPlayer, GAME_EVENTS, GameInputPayload
│   │   └── game.test.ts        # +getImpostorCount tests
│   ├── server/src/
│   │   ├── game/
│   │   │   ├── roles.ts        # assignRoles() + getImpostorCount
│   │   │   ├── engine.ts       # GameEngine class (tick, hareket, çarpışma)
│   │   │   ├── types.ts        # GameState, GamePlayer (server-internal)
│   │   │   └── mapData.ts      # wallGrid (collision data, hardcoded from generator)
│   │   ├── sockets/
│   │   │   ├── lobbyHandlers.ts # MODIFY: start handler → create match
│   │   │   └── gameHandlers.ts  # game:input handler
│   │   ├── index.ts            # MODIFY: instantiate GameEngine
│   │   └── prisma/
│   │       └── schema.prisma   # +Match, +MatchPlayer, enums
│   ├── server/tests/
│   │   ├── game.roles.test.ts
│   │   ├── game.engine.test.ts
│   │   └── game.map.test.ts
│   ├── server/scripts/
│   │   ├── generate-map.mjs    # Tiled JSON + wallGrid üretimi
│   │   └── generate-sprites.mjs# tileset.png + player.png üretimi
│   └── client/
│       ├── package.json        # +phaser dependency
│       ├── src/
│       │   ├── phaser/
│       │   │   ├── main.ts     # Phaser.Game config + start/stop
│       │   │   ├── config.ts   # Sabitler
│       │   │   └── scenes/
│       │   │       ├── BootScene.ts
│       │   │       └── GameScene.ts
│       │   ├── screens/
│       │   │   ├── lobby.ts    # MODIFY: game:started listener
│       │   │   └── game.ts     # game screen yöneticisi
│       │   ├── app.ts          # MODIFY: initGameScreen
│       │   └── network/
│       │       └── socket.ts   # MODIFY: disconnect cleanup
│       └── public/assets/
│           ├── map.json        # generated tilemap
│           ├── tileset.png     # generated tileset
│           └── player.png      # generated spritesheet
└── index.html                  # MODIFY: +game-screen section
```

---

## Task 1: Shared — Game Constants, Types, Role Logic

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/src/game.test.ts`

**Interfaces:**
- Produces: `PLAYER_SPEED`, `TICK_RATE_HZ`, `TICK_INTERVAL_MS`, `DIAGONAL_FACTOR`, `TILE_SIZE`, `PLAYER_HITBOX`, `getImpostorCount()`, `GameStartedPayload`, `TickPlayer`, `GameTickPayload`, `GameInputPayload`, `GAME_EVENTS`, `PlayerRole`, `PlayerFacing`
- Consumes: existing constants infrastructure

- [ ] **Step 1: `constants.ts`'ye game sabitleri ekle**

`packages/shared/src/constants.ts` sonuna ekle:

```typescript

// ─── Game constants ────────────────────────────────────────────────────

export const PLAYER_SPEED = 3.0;              // tiles per second
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ; // 50ms
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2); // ~0.707
export const TILE_SIZE = 32;                  // pixels per tile
export const PLAYER_HITBOX = 20;              // pixels (smaller than tile)

/** Number of impostors based on total player count. */
export function getImpostorCount(playerCount: number): number {
  if (playerCount <= 5) return 1;
  if (playerCount <= 7) return 2;
  return Math.min(3, Math.floor(playerCount / 3));
}
```

- [ ] **Step 2: `types.ts`'ye game tipleri ekle**

`packages/shared/src/types.ts` sonuna ekle:

```typescript

// ─── Game types ────────────────────────────────────────────────────────

export type PlayerRole = "IMPOSTOR" | "CREW";
export type PlayerFacing = "up" | "down" | "left" | "right";

export interface GameStartedPlayer {
  userId: string;
  username: string;
  color: string;
}

export interface GameStartedPayload {
  matchId: string;
  role: PlayerRole;
  players: GameStartedPlayer[];
  spawn: { x: number; y: number };
}

export interface TickPlayer {
  userId: string;
  x: number;
  y: number;
  facing: PlayerFacing;
  isAlive: boolean;
}

export interface GameTickPayload {
  players: TickPlayer[];
}

export interface GameInputPayload {
  dx: number;
  dy: number;
  seq: number;
}

export interface GameEndedPayload {
  winner: "CREW" | "IMPOSTOR";
}

export const GAME_EVENTS = {
  INPUT: "game:input",
  STARTED: "game:started",
  TICK: "game:tick",
  ENDED: "game:ended",
} as const;
```

- [ ] **Step 3: Failing test yaz — `packages/shared/src/game.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { getImpostorCount, PLAYER_SPEED, TICK_RATE_HZ, TILE_SIZE } from "./constants.js";
import { GAME_EVENTS } from "./types.js";

describe("game constants", () => {
  it("has correct tick rate and tile size", () => {
    expect(TICK_RATE_HZ).toBe(20);
    expect(TILE_SIZE).toBe(32);
    expect(PLAYER_SPEED).toBe(3.0);
  });

  it("defines game event names", () => {
    expect(GAME_EVENTS.INPUT).toBe("game:input");
    expect(GAME_EVENTS.STARTED).toBe("game:started");
    expect(GAME_EVENTS.TICK).toBe("game:tick");
    expect(GAME_EVENTS.ENDED).toBe("game:ended");
  });
});

describe("getImpostorCount", () => {
  it("returns 1 for 4-5 players", () => {
    expect(getImpostorCount(4)).toBe(1);
    expect(getImpostorCount(5)).toBe(1);
  });

  it("returns 2 for 6-7 players", () => {
    expect(getImpostorCount(6)).toBe(2);
    expect(getImpostorCount(7)).toBe(2);
  });

  it("returns 2-3 for 8-10 players", () => {
    expect(getImpostorCount(8)).toBe(2);
    expect(getImpostorCount(9)).toBe(3);
    expect(getImpostorCount(10)).toBe(3);
  });

  it("never returns more than 3", () => {
    expect(getImpostorCount(10)).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 4: Test çalıştır, geçtiğini doğrula**

Run: `cd packages/shared && npx vitest run src/game.test.ts`
Expected: PASS — 7 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add game constants, types, and getImpostorCount with tests"
```

---

## Task 2: Server — Prisma Match Models + Migration

**Files:**
- Modify: `packages/server/prisma/schema.prisma`
- Modify: `packages/server/src/sockets/types.ts` (User relation needs MatchPlayer)
- Generate: migration SQL

**Interfaces:**
- Produces: `Match`, `MatchPlayer` Prisma models, `MatchStatus`/`Role`/`Team` enums
- Consumes: existing User model

- [ ] **Step 1: `schema.prisma`'ya modelleri ekle**

`packages/server/prisma/schema.prisma` dosyasını aç. `User` modeline `matches` relation ekle (model içine):

```prisma
  matches     MatchPlayer[]
```

Sonra dosyanın sonuna şu modelleri ekle:

```prisma
model Match {
  id        String      @id @default(cuid())
  code      String
  status    MatchStatus @default(IN_PROGRESS)
  hostId    String
  createdAt DateTime    @default(now())
  endedAt   DateTime?
  winner    Team?
  players   MatchPlayer[]
}

model MatchPlayer {
  id       String  @id @default(cuid())
  match    Match   @relation(fields: [matchId], references: [id], onDelete: Cascade)
  matchId  String
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  role     Role?
  isAlive  Boolean @default(true)
  color    String

  @@unique([matchId, userId])
}

enum MatchStatus {
  LOBBY
  IN_PROGRESS
  ENDED
}

enum Role {
  IMPOSTOR
  CREW
}

enum Team {
  CREW
  IMPOSTOR
}
```

- [ ] **Step 2: Prisma client regenerate**

Run: `cd packages/server && npx prisma generate`
Expected: `generated client` mesajı

- [ ] **Step 3: Migration SQL üret (DB gerektirmeden)**

Run:
```bash
cd packages/server
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/match-migration.sql
```

Actually, we want a diff against the EXISTING schema (the applied one). Use:
```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

If that needs DB access, instead generate the migration manually. Create `packages/server/prisma/migrations/20260706000001_add_match_models/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('LOBBY', 'IN_PROGRESS', 'ENDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('IMPOSTOR', 'CREW');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('CREW', 'IMPOSTOR');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "hostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "winner" "Team",

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role",
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: tsc doğrula**

Run: `cd packages/server && npx tsc --noEmit`
Expected: hata yok

- [ ] **Step 5: Commit**

```bash
git add packages/server/prisma/
git commit -m "feat(server): add Match and MatchPlayer Prisma models with migration"
```

---

## Task 3: Server — Role Assignment Logic (TDD)

**Files:**
- Create: `packages/server/src/game/roles.ts`
- Test: `packages/server/tests/game.roles.test.ts`

**Interfaces:**
- Produces: `assignRoles(playerIds: string[]): Map<string, PlayerRole>`
- Consumes: `getImpostorCount` from shared

- [ ] **Step 1: Failing test yaz — `packages/server/tests/game.roles.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { assignRoles } from "../src/game/roles.js";
import { getImpostorCount } from "@amongus/shared";

describe("assignRoles", () => {
  it("assigns correct number of impostors", () => {
    const ids = ["u1", "u2", "u3", "u4"];
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(getImpostorCount(4));
    expect(impostors.length).toBe(1);
  });

  it("assigns 2 impostors for 6 players", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5", "u6"];
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(2);
  });

  it("assigns 3 impostors for 10 players", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(3);
  });

  it("assigns all players a role", () => {
    const ids = ["u1", "u2", "u3", "u4"];
    const roles = assignRoles(ids);
    expect(roles.size).toBe(4);
    for (const id of ids) {
      expect(roles.has(id)).toBe(true);
    }
  });

  it("assigns only IMPOSTOR or CREW", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5"];
    const roles = assignRoles(ids);
    for (const role of roles.values()) {
      expect(["IMPOSTOR", "CREW"]).toContain(role);
    }
  });

  it("produces different results across calls (randomness)", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `u${i}`);
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const roles = assignRoles(ids);
      const impostorKey = [...roles.entries()]
        .filter(([, r]) => r === "IMPOSTOR")
        .map(([id]) => id)
        .sort()
        .join(",");
      results.add(impostorKey);
    }
    // With C(8,2)=28 possible impostor pairs, 20 calls should yield variety
    expect(results.size).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Test çalıştır, RED doğrula**

Run: `cd packages/server && npx vitest run tests/game.roles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implementation — `packages/server/src/game/roles.ts`**

```typescript
import { getImpostorCount, type PlayerRole } from "@amongus/shared";

/**
 * Assign roles to players using Fisher-Yates shuffle.
 * Returns a Map of userId → role.
 */
export function assignRoles(playerIds: string[]): Map<string, PlayerRole> {
  const shuffled = [...playerIds];

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const impostorCount = getImpostorCount(playerIds.length);
  const roles = new Map<string, PlayerRole>();

  for (let i = 0; i < shuffled.length; i++) {
    roles.set(shuffled[i], i < impostorCount ? "IMPOSTOR" : "CREW");
  }

  return roles;
}
```

- [ ] **Step 4: Test çalıştır, GREEN doğrula**

Run: `cd packages/server && npx vitest run tests/game.roles.test.ts`
Expected: PASS — 6 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/game/roles.ts packages/server/tests/game.roles.test.ts
git commit -m "feat(server): add role assignment with Fisher-Yates shuffle"
```

---

## Task 4: Server — Map Data (wallGrid) + Generator Script

**Files:**
- Create: `packages/server/scripts/generate-map.mjs`
- Create: `packages/server/src/game/mapData.ts`
- Create: `packages/client/public/assets/map.json` (generated output)
- Test: `packages/server/tests/game.map.test.ts`

**Interfaces:**
- Produces: `WALL_GRID: boolean[][]` (50×50, true=wall), `MAP_WIDTH`, `MAP_HEIGHT`, `SPAWN_CENTER`
- Consumes: `TILE_SIZE` from shared

- [ ] **Step 1: Map generator script — `packages/server/scripts/generate-map.mjs`**

```javascript
// Generates a Tiled-format JSON map + exports wallGrid as TS.
// Run: node scripts/generate-map.mjs
// Outputs: packages/client/public/assets/map.json

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;

// Tile IDs: 0=empty, 1=wall, 2=floor(corridor), 3=floor(room), 4=spawn
const TILE = { EMPTY: 0, WALL: 1, FLOOR_CORRIDOR: 2, FLOOR_ROOM: 3, SPAWN: 4 };

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

// Connect rooms with corridors (horizontal/vertical)
// Cafeteria center ~ (25, 25)
corridorH(ground, 20, 35, 22); // left→right through cafeteria row
corridorV(ground, 20, 40, 24); // top→bottom through cafeteria col
corridorH(ground, 30, 38, 30); // to navigation/o2
corridorH(ground, 13, 20, 20); // to storage
corridorV(ground, 28, 40, 26); // to admin

// Compute walls: any tile that's still WALL in ground = wall
for (let r = 0; r < MAP_HEIGHT; r++) {
  for (let c = 0; c < MAP_WIDTH; c++) {
    walls[r][c] = ground[r][c] === TILE.WALL ? 1 : 0;
    wallGrid[r][c] = ground[r][c] === TILE.WALL;
  }
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
  tilesets: [
    {
      firstgid: 1,
      source: "tileset.json",
      name: "tileset",
    },
  ],
  layers: [
    {
      name: "Ground",
      type: "tilelayer",
      data: ground.flat().map((t) => (t === TILE.WALL ? 0 : t === TILE.FLOOR_CORRIDOR ? 2 : t === TILE.FLOOR_ROOM ? 3 : t === TILE.SPAWN ? 4 : 0)),
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      visible: true,
      opacity: 1,
    },
    {
      name: "Walls",
      type: "tilelayer",
      data: walls.flat(),
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
```

- [ ] **Step 2: Script'i çalıştır**

Run: `cd packages/server && node scripts/generate-map.mjs`
Expected: iki dosya yazıldı (`map.json` ve `mapData.ts`)

- [ ] **Step 3: Doğrula — `packages/server/tests/game.map.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "../src/game/mapData.js";

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
});
```

- [ ] **Step 4: Test çalıştır**

Run: `cd packages/server && npx vitest run tests/game.map.test.ts`
Expected: PASS — 5 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/scripts/generate-map.mjs packages/server/src/game/mapData.ts packages/server/tests/game.map.test.ts packages/client/public/assets/map.json
git commit -m "feat(server): add programmatic map generation (Tiled JSON + wallGrid)"
```

---

## Task 5: Server — GameEngine (tick loop, movement, collision)

**Files:**
- Create: `packages/server/src/game/types.ts`
- Create: `packages/server/src/game/engine.ts`
- Test: `packages/server/tests/game.engine.test.ts`

**Interfaces:**
- Produces: `GameEngine` class
  - `createMatch(matchId, code, players: {userId, username, color}[]): void`
  - `setInput(matchId, userId, dx, dy, seq): void`
  - `tick(matchId): GameTickPayload` — bir tick çalıştır, payload döndür
  - `getMatch(matchId): GameState | undefined`
  - `removeMatch(matchId): void`
- Consumes: `WALL_GRID`, `PLAYER_SPEED`, `DIAGONAL_FACTOR`, `TICK_INTERVAL_MS`, `assignRoles`

- [ ] **Step 1: Server-internal game types — `packages/server/src/game/types.ts`**

```typescript
import type { PlayerRole, PlayerFacing } from "@amongus/shared";

export interface GamePlayer {
  userId: string;
  username: string;
  color: string;
  role: PlayerRole;
  isAlive: boolean;
  x: number;
  y: number;
  inputDx: number;
  inputDy: number;
  facing: PlayerFacing;
  lastInputSeq: number;
  socketId: string;
}

export interface GameState {
  matchId: string;
  code: string;
  status: "IN_PROGRESS" | "ENDED";
  players: Map<string, GamePlayer>;
  tickRate: number;
  createdAt: number;
}
```

- [ ] **Step 2: Failing test yaz — `packages/server/tests/game.engine.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { PLAYER_SPEED, TICK_INTERVAL_MS, DIAGONAL_FACTOR } from "@amongus/shared";

describe("GameEngine", () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  const players = [
    { userId: "u1", username: "alice", color: "red" },
    { userId: "u2", username: "bob", color: "blue" },
    { userId: "u3", username: "carol", color: "green" },
    { userId: "u4", username: "dave", color: "pink" },
  ];

  describe("createMatch", () => {
    it("creates a match with players at spawn", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1");
      expect(match).toBeDefined();
      expect(match!.players.size).toBe(4);
    });

    it("assigns roles (1 impostor for 4 players)", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1")!;
      const impostors = [...match.players.values()].filter((p) => p.role === "IMPOSTOR");
      expect(impostors.length).toBe(1);
    });

    it("spawns players in cafeteria area", () => {
      engine.createMatch("m1", "ABC234", players);
      const match = engine.getMatch("m1")!;
      for (const p of match.players.values()) {
        // spawn center 25,25 — players within ~3 tiles
        expect(Math.abs(p.x - 25)).toBeLessThan(4);
        expect(Math.abs(p.y - 25)).toBeLessThan(4);
      }
    });
  });

  describe("tick movement", () => {
    it("moves player right when input is (1,0)", () => {
      engine.createMatch("m1", "ABC234", players);
      const before = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = before.x;

      engine.setInput("m1", "u1", 1, 0, 1);
      engine.tick("m1");

      const after = engine.getMatch("m1")!.players.get("u1")!;
      expect(after.x).toBeGreaterThan(oldX);
      expect(after.facing).toBe("right");
    });

    it("moves player by correct distance in one tick", () => {
      engine.createMatch("m1", "ABC234", players);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = p.x;

      engine.setInput("m1", "u1", 1, 0, 1);
      const payload = engine.tick("m1");

      const expectedDelta = PLAYER_SPEED * (TICK_INTERVAL_MS / 1000);
      const actualDelta = engine.getMatch("m1")!.players.get("u1")!.x - oldX;
      expect(actualDelta).toBeCloseTo(expectedDelta, 4);
    });

    it("normalizes diagonal movement", () => {
      engine.createMatch("m1", "ABC234", players);
      const p = engine.getMatch("m1")!.players.get("u1")!;
      const oldX = p.x;
      const oldY = p.y;

      engine.setInput("m1", "u1", 1, 1, 1);
      engine.tick("m1");

      const newX = engine.getMatch("m1")!.players.get("u1")!.x;
      const newY = engine.getMatch("m1")!.players.get("u1")!.y;
      const dx = newX - oldX;
      const dy = newY - oldY;
      // diagonal speed should be speed * diagonal_factor
      const expected = PLAYER_SPEED * DIAGONAL_FACTOR * (TICK_INTERVAL_MS / 1000);
      expect(dx).toBeCloseTo(expected, 4);
      expect(dy).toBeCloseTo(expected, 4);
    });

    it("does not move when input is (0,0)", () => {
      engine.createMatch("m1", "ABC234", players);
      const oldX = engine.getMatch("m1")!.players.get("u1")!.x;

      engine.setInput("m1", "u1", 0, 0, 1);
      engine.tick("m1");

      expect(engine.getMatch("m1")!.players.get("u1")!.x).toBe(oldX);
    });

    it("blocks movement into walls", () => {
      engine.createMatch("m1", "ABC234", players);
      // Move player next to a wall and try to push into it
      const p = engine.getMatch("m1")!.players.get("u1")!;
      p.x = 1; // near left border (x=0 is wall)

      engine.setInput("m1", "u1", -1, 0, 1); // try to move left into wall
      engine.tick("m1");

      expect(engine.getMatch("m1")!.players.get("u1")!.x).toBe(1); // didn't move
    });

    it("updates facing direction", () => {
      engine.createMatch("m1", "ABC234", players);

      engine.setInput("m1", "u1", 0, 1, 1); // down
      engine.tick("m1");
      expect(engine.getMatch("m1")!.players.get("u1")!.facing).toBe("down");

      engine.setInput("m1", "u1", 0, -1, 2); // up
      engine.tick("m1");
      expect(engine.getMatch("m1")!.players.get("u1")!.facing).toBe("up");
    });

    it("returns tick payload with all players", () => {
      engine.createMatch("m1", "ABC234", players);
      engine.setInput("m1", "u1", 1, 0, 1);
      const payload = engine.tick("m1");

      expect(payload.players).toHaveLength(4);
      expect(payload.players[0]).toHaveProperty("x");
      expect(payload.players[0]).toHaveProperty("y");
      expect(payload.players[0]).toHaveProperty("facing");
      expect(payload.players[0]).toHaveProperty("isAlive");
    });
  });

  describe("removeMatch", () => {
    it("removes a match", () => {
      engine.createMatch("m1", "ABC234", players);
      engine.removeMatch("m1");
      expect(engine.getMatch("m1")).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Test çalıştır, RED doğrula**

Run: `cd packages/server && npx vitest run tests/game.engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implementation — `packages/server/src/game/engine.ts`**

```typescript
import { PLAYER_SPEED, DIAGONAL_FACTOR, TICK_INTERVAL_MS } from "@amongus/shared";
import type { GameTickPayload, TickPlayer } from "@amongus/shared";
import { assignRoles } from "./roles.js";
import { WALL_GRID, MAP_WIDTH, MAP_HEIGHT, SPAWN_CENTER } from "./mapData.js";
import type { GameState, GamePlayer } from "./types.js";

const PLAYER_RADIUS = 0.3; // tile units, for hitbox (PLAYER_HITBOX/TILE_SIZE ≈ 0.625, half ≈ 0.3)

function isWall(x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return true;
  return WALL_GRID[ty][tx];
}

function canMoveTo(newX: number, newY: number): boolean {
  // Check 4 corners of player hitbox
  const r = PLAYER_RADIUS;
  const corners = [
    [newX - r, newY - r],
    [newX + r, newY - r],
    [newX - r, newY + r],
    [newX + r, newY + r],
  ];
  return corners.every(([cx, cy]) => !isWall(cx, cy));
}

function getSpawnPosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / total) * Math.PI * 2;
  const radius = 2;
  return {
    x: SPAWN_CENTER.x + Math.cos(angle) * radius,
    y: SPAWN_CENTER.y + Math.sin(angle) * radius,
  };
}

export class GameEngine {
  private matches = new Map<string, GameState>();

  createMatch(
    matchId: string,
    code: string,
    players: { userId: string; username: string; color: string }[],
    socketIdMap?: Map<string, string>
  ): void {
    const roles = assignRoles(players.map((p) => p.userId));
    const playerMap = new Map<string, GamePlayer>();

    players.forEach((p, i) => {
      const spawn = getSpawnPosition(i, players.length);
      playerMap.set(p.userId, {
        userId: p.userId,
        username: p.username,
        color: p.color,
        role: roles.get(p.userId)!,
        isAlive: true,
        x: spawn.x,
        y: spawn.y,
        inputDx: 0,
        inputDy: 0,
        facing: "down",
        lastInputSeq: 0,
        socketId: socketIdMap?.get(p.userId) ?? "",
      });
    });

    this.matches.set(matchId, {
      matchId,
      code,
      status: "IN_PROGRESS",
      players: playerMap,
      tickRate: 20,
      createdAt: Date.now(),
    });
  }

  setInput(matchId: string, userId: string, dx: number, dy: number, seq: number): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    const player = match.players.get(userId);
    if (!player) return;
    if (seq <= player.lastInputSeq) return; // ignore stale inputs
    player.inputDx = dx;
    player.inputDy = dy;
    player.lastInputSeq = seq;
  }

  tick(matchId: string): GameTickPayload {
    const match = this.matches.get(matchId);
    if (!match) return { players: [] };

    const delta = TICK_INTERVAL_MS / 1000; // 0.05s
    const tickPlayers: TickPlayer[] = [];

    for (const player of match.players.values()) {
      if (!player.isAlive) {
        tickPlayers.push({
          userId: player.userId,
          x: player.x,
          y: player.y,
          facing: player.facing,
          isAlive: false,
        });
        continue;
      }

      let dx = player.inputDx;
      let dy = player.inputDy;

      // Normalize diagonal
      if (dx !== 0 && dy !== 0) {
        dx *= DIAGONAL_FACTOR;
        dy *= DIAGONAL_FACTOR;
      }

      const moveX = dx * PLAYER_SPEED * delta;
      const moveY = dy * PLAYER_SPEED * delta;

      // Try X movement
      const newX = player.x + moveX;
      if (canMoveTo(newX, player.y)) {
        player.x = newX;
      }

      // Try Y movement
      const newY = player.y + moveY;
      if (canMoveTo(player.x, newY)) {
        player.y = newY;
      }

      // Update facing
      if (Math.abs(dy) > Math.abs(dx)) {
        player.facing = dy < 0 ? "up" : dy > 0 ? "down" : player.facing;
      } else if (dx !== 0) {
        player.facing = dx < 0 ? "left" : "right";
      }

      tickPlayers.push({
        userId: player.userId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        isAlive: player.isAlive,
      });
    }

    return { players: tickPlayers };
  }

  getMatch(matchId: string): GameState | undefined {
    return this.matches.get(matchId);
  }

  removeMatch(matchId: string): void {
    this.matches.delete(matchId);
  }
}
```

- [ ] **Step 5: Test çalıştır, GREEN doğrula**

Run: `cd packages/server && npx vitest run tests/game.engine.test.ts`
Expected: PASS — ~12 test yeşil

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/game/types.ts packages/server/src/game/engine.ts packages/server/tests/game.engine.test.ts
git commit -m "feat(server): add GameEngine with tick loop, movement, and collision"
```

---

## Task 6: Server — Game Socket Handlers + Lobby Start Wiring

**Files:**
- Create: `packages/server/src/sockets/gameHandlers.ts`
- Modify: `packages/server/src/sockets/lobbyHandlers.ts` (start handler)
- Modify: `packages/server/src/sockets/index.ts` (register game handlers + tick interval)
- Modify: `packages/server/src/index.ts` (instantiate GameEngine, pass to setup)

**Interfaces:**
- Produces: `registerGameHandlers(io, socket, engine)`, modified start flow that creates a match + emits game:started
- Consumes: `GameEngine`, `GAME_EVENTS`, `LobbyManager`, `prisma`

- [ ] **Step 1: Game handlers — `packages/server/src/sockets/gameHandlers.ts`**

```typescript
import type { ExtendedIo, ExtendedSocket } from "./types.js";
import type { GameEngine } from "../game/engine.js";
import { GAME_EVENTS } from "@amongus/shared";

export function registerGameHandlers(
  _io: ExtendedIo,
  socket: ExtendedSocket,
  engine: GameEngine
): void {
  const user = socket.data.user;

  socket.on(GAME_EVENTS.INPUT, (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as any).dx !== "number" ||
      typeof (payload as any).dy !== "number" ||
      typeof (payload as any).seq !== "number"
    ) {
      return; // ignore malformed
    }
    const { dx, dy, seq } = payload as { dx: number; dy: number; seq: number };
    // Find which match this user is in
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    engine.setInput(match.matchId, user.userId, dx, dy, seq);
  });
}
```

- [ ] **Step 2: GameEngine'e `findMatchByUser` ekle**

`packages/server/src/game/engine.ts`'de sınıfa method ekle:

```typescript
  findMatchByUser(userId: string): GameState | undefined {
    for (const match of this.matches.values()) {
      if (match.players.has(userId)) return match;
    }
    return undefined;
  }
```

- [ ] **Step 3: Lobby start handler'ı güncelle — `packages/server/src/sockets/lobbyHandlers.ts`**

Mevcut `START` handler'ını değiştir. İmza değişiyor — artık `engine` ve `prisma` da alıyor. `registerLobbyHandlers` fonksiyonunu güncelle:

```typescript
import { prisma } from "../db/prisma.js";
import { GameEngine } from "../game/engine.js";
import { GAME_EVENTS, LOBBY_EVENTS } from "@amongus/shared";
import type { GameState } from "../game/types.js";

export function registerLobbyHandlers(
  io: ExtendedIo,
  socket: ExtendedSocket,
  mgr: LobbyManager,
  engine: GameEngine
): void {
```

`START` handler'ını değiştir:

```typescript
  socket.on(LOBBY_EVENTS.START, async () => {
    const result = mgr.startLobby(user.userId);
    if ("error" in result || !result.lobby) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error!, message: errorToMessage(result.error!) });
      return;
    }

    const lobby = result.lobby;
    io.to(lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(lobby));

    // Create match in DB
    const match = await prisma.match.create({
      data: {
        code: lobby.code,
        hostId: lobby.hostId,
        status: "IN_PROGRESS",
        players: {
          create: lobby.players.map((p) => ({
            userId: p.userId,
            color: p.color,
          })),
        },
      },
    });

    // Create game state
    const socketIdMap = new Map(lobby.players.map((p) => [p.userId, p.socketId]));
    engine.createMatch(
      match.id,
      lobby.code,
      lobby.players.map((p) => ({ userId: p.userId, username: p.username, color: p.color })),
      socketIdMap
    );

    // Assign roles in DB
    const gameMatch = engine.getMatch(match.id)!;
    for (const p of gameMatch.players.values()) {
      await prisma.matchPlayer.updateMany({
        where: { matchId: match.id, userId: p.userId },
        data: { role: p.role },
      });
    }

    // Emit game:started to each player (with THEIR role)
    for (const p of gameMatch.players.values()) {
      const payload = {
        matchId: match.id,
        role: p.role,
        players: [...gameMatch.players.values()].map((gp) => ({
          userId: gp.userId,
          username: gp.username,
          color: gp.color,
        })),
        spawn: { x: p.x, y: p.y },
      };
      io.to(p.socketId).emit(GAME_EVENTS.STARTED, payload);
    }
  });
```

- [ ] **Step 4: `index.ts` socket setup'ı güncelle — `packages/server/src/sockets/index.ts`**

`setupSocketServer` imzasını güncelle (engine parametresi ekle):

```typescript
import { GameEngine } from "../game/engine.js";
import { registerGameHandlers } from "./gameHandlers.js";
import { GAME_EVENTS } from "@amongus/shared";

export function setupSocketServer(
  httpServer: HTTPServer,
  lobbyManager: LobbyManager,
  gameEngine: GameEngine
): ExtendedIo {
  // ... existing code ...

  io.on("connection", (socket: ExtendedSocket) => {
    registerLobbyHandlers(io, socket, lobbyManager, gameEngine);
    registerGameHandlers(io, socket, gameEngine);

    socket.on("disconnect", () => {
      // existing lobby cleanup
      const lobbyResult = lobbyManager.leaveLobbyBySocket(socket.id);
      if (lobbyResult.lobby) {
        io.to(lobbyResult.lobby.code).emit("lobby:updated", lobbyManager.toLobbyState(lobbyResult.lobby));
      }
      // TODO: game cleanup (Sub-project 4+ — handle mid-game disconnect)
    });
  });

  // Start tick loop
  const TICK_MS = 50;
  setInterval(() => {
    for (const matchId of gameEngine.getActiveMatchIds()) {
      const payload = gameEngine.tick(matchId);
      const match = gameEngine.getMatch(matchId);
      if (match) {
        io.to(match.code).emit(GAME_EVENTS.TICK, payload);
      }
    }
  }, TICK_MS);

  return io;
}
```

- [ ] **Step 5: GameEngine'e `getActiveMatchIds` ekle**

`engine.ts`'ye:

```typescript
  getActiveMatchIds(): string[] {
    return [...this.matches.values()]
      .filter((m) => m.status === "IN_PROGRESS")
      .map((m) => m.matchId);
  }
```

- [ ] **Step 6: `src/index.ts`'i güncelle — GameEngine instantiate**

```typescript
import { GameEngine } from "./game/engine.js";

// In main():
const lobbyManager = new LobbyManager();
const gameEngine = new GameEngine();
setupSocketServer(server, lobbyManager, gameEngine);
```

- [ ] **Step 7: tsc + test doğrula**

Run: `cd packages/server && npx tsc --noEmit`
Expected: hata yok

Run: `cd packages/server && npx vitest run tests/game.roles.test.ts tests/game.engine.test.ts tests/game.map.test.ts tests/lobby.codes.test.ts tests/lobby.manager.test.ts`
Expected: tüm testler yeşil (lobby socket testleri bağlantı gerektirebilir, onları atla)

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/sockets/ packages/server/src/index.ts
git commit -m "feat(server): wire game socket handlers, lobby start → match creation + tick loop"
```

---

## Task 7: Client — Sprite + Tileset Generator

**Files:**
- Create: `packages/server/scripts/generate-sprites.mjs`
- Create: `packages/client/public/assets/tileset.png` (generated)
- Create: `packages/client/public/assets/tileset.json` (Tiled tileset def)
- Create: `packages/client/public/assets/player.png` (generated, 8-frame spritesheet)

**Interfaces:**
- Produces: tileset.png (4 tiles), tileset.json (Tiled format), player.png (8 frames, 32×32)

- [ ] **Step 1: Sprite generator script — `packages/server/scripts/generate-sprites.mjs`**

```javascript
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
```

- [ ] **Step 2: `canvas` bağımlılığını yükle**

Run:
```bash
cd packages/server
npm install --save-dev canvas
```

- [ ] **Step 3: Script'i çalıştır**

Run: `cd packages/server && node scripts/generate-sprites.mjs`
Expected: 3 dosya yazıldı (tileset.png, tileset.json, player.png)

- [ ] **Step 4: Commit**

```bash
git add packages/server/scripts/generate-sprites.mjs packages/client/public/assets/ packages/server/package.json
git commit -m "feat: add programmatic tileset + player sprite generation"
```

---

## Task 8: Client — Phaser Dependency + Config + BootScene

**Files:**
- Modify: `packages/client/package.json` (add phaser)
- Create: `packages/client/src/phaser/config.ts`
- Create: `packages/client/src/phaser/main.ts`
- Create: `packages/client/src/phaser/scenes/BootScene.ts`

**Interfaces:**
- Produces: `startPhaserGame(payload)`, `stopPhaserGame()`, Phaser config, BootScene (asset preload)

- [ ] **Step 1: Phaser bağımlılığı ekle**

`packages/client/package.json`'da `dependencies`'e ekle:
```json
"phaser": "^3.80.1"
```

Run: `cd packages/client && npm install`

- [ ] **Step 2: `packages/client/src/phaser/config.ts`**

```typescript
export const PHASER_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  parent: "game-container",
  pixelArt: true,
  render: { pixelArt: true, antialias: false },
} as const;

export const TILE_SIZE = 32;
export const CAMERA_ZOOM = 2;
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2);
export const INPUT_SEND_INTERVAL_MS = 50;
export const INTERP_FACTOR = 0.3;
```

- [ ] **Step 3: `packages/client/src/phaser/scenes/BootScene.ts`**

```typescript
import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("tileset", "/assets/tileset.png");
    this.load.tilemapTiledJSON("map", "/assets/map.json");
    this.load.spritesheet("player", "/assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create(): void {
    this.scene.start("GameScene", this.scene.settings.data);
  }
}
```

- [ ] **Step 4: `packages/client/src/phaser/main.ts`**

Uses `game.registry` to pass the payload — cleanest approach, no scene-settings hacking:

```typescript
import Phaser from "phaser";
import { PHASER_CONFIG } from "./config.js";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import type { GameStartedPayload } from "../types.js";

let game: Phaser.Game | null = null;

export function startPhaserGame(payload: GameStartedPayload): void {
  if (game) {
    game.destroy(true);
  }
  game = new Phaser.Game({
    ...PHASER_CONFIG,
    scene: [BootScene, GameScene],
  });
  game.registry.set("gamePayload", payload);
}

export function stopPhaserGame(): void {
  if (game) {
    game.destroy(true);
    game = null;
  }
}
```

`BootScene.create()` reads from registry and passes to GameScene via `this.scene.start("GameScene")`. `GameScene.init()`/`create()` reads `this.game.registry.get("gamePayload")`.

- [ ] **Step 5: Commit**

```bash
git add packages/client/
git commit -m "feat(client): add Phaser dependency, config, and BootScene"
```

---

## Task 9: Client — GameScene (map, players, input, interpolation)

**Files:**
- Create: `packages/client/src/phaser/scenes/GameScene.ts`
- Modify: `packages/client/index.html` (add game-screen section)
- Create: `packages/client/src/screens/game.ts`
- Modify: `packages/client/src/screens/lobby.ts` (game:started → start Phaser)
- Modify: `packages/client/src/app.ts` (init game screen)

**Interfaces:**
- Produces: Full GameScene with tilemap, sprites, WASD, interpolation, animation

- [ ] **Step 1: `index.html`'e game-screen ekle**

`packages/client/index.html` dosyasında `#app` div'i içinde, `#lobby-screen`'den sonra ekle:

```html
      <section id="game-screen" class="screen" hidden>
        <div id="game-container"></div>
        <div class="role-badge" id="role-display"></div>
      </section>
```

Ve `<head>`'e ekle (lobby CSS'ye):
```html
<style>
  #game-screen { max-width: none; padding: 0; }
  #game-container { width: 100vw; height: 100vh; }
  .role-badge {
    position: fixed; top: 12px; right: 12px;
    background: rgba(0,0,0,0.7); color: #fff;
    padding: 8px 16px; border-radius: 8px;
    font-weight: bold; z-index: 100;
  }
</style>
```

- [ ] **Step 2: `packages/client/src/screens/game.ts`**

```typescript
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import { startPhaserGame, stopPhaserGame } from "../phaser/main.js";
import type { GameStartedPayload } from "../types.js";

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", (payload: GameStartedPayload) => {
    showScreen("game");
    const roleEl = document.getElementById("role-display")!;
    roleEl.textContent = payload.role === "IMPOSTOR" ? "🔪 IMPOSTOR" : "🛠️ CREWMATE";
    roleEl.style.background = payload.role === "IMPOSTOR" ? "rgba(200,30,30,0.8)" : "rgba(30,100,200,0.8)";
    startPhaserGame(payload);
  });

  socket.on("game:ended", () => {
    stopPhaserGame();
    showScreen("menu");
  });
}
```

- [ ] **Step 3: `app.ts`'yi güncelle — initGameScreen çağır**

`packages/client/src/app.ts`'de `bootstrap()` fonksiyonuna ekle:

```typescript
import { initGameScreen } from "./screens/game.js";
// ...
async function bootstrap() {
  initLoginScreen();
  initMenuScreen();
  initLobbyScreen();
  initGameScreen();  // ADD THIS
  // ... rest
}
```

- [ ] **Step 4: `packages/client/src/phaser/scenes/GameScene.ts`**

```typescript
import Phaser from "phaser";
import { getSocket } from "../../network/socket.js";
import { TILE_SIZE, CAMERA_ZOOM, DIAGONAL_FACTOR, INPUT_SEND_INTERVAL_MS, INTERP_FACTOR } from "../config.js";
import type { GameStartedPayload, GameTickPayload } from "../../types.js";

const COLOR_HEX: Record<string, number> = {
  red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, pink: 0xec407a,
  orange: 0xfb8c00, yellow: 0xfdd835, black: 0x212121, white: 0xfafafa,
  purple: 0x8e24aa, brown: 0x795548, cyan: 0x00acc1, lime: 0xc0ca33,
};

interface PlayerSprite {
  sprite: Phaser.GameObjects.Sprite;
  targetX?: number;
  targetY?: number;
  usernameText: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private matchId = "";
  private myRole: "IMPOSTOR" | "CREW" = "CREW";
  private myUserId = "";
  private playerSprites: Record<string, PlayerSprite> = {};
  private myPlayer?: Phaser.GameObjects.Sprite;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private lastInputSent = 0;
  private lastDx = 0;
  private lastDy = 0;
  private seqCounter = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  init(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;
    this.matchId = payload.matchId;
    this.myRole = payload.role;
  }

  create(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;

    // 1. Tilemap
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("tileset", "tileset");
    if (tileset) {
      map.createLayer("Ground", tileset, 0, 0);
      map.createLayer("Walls", tileset, 0, 0);
    }

    // 2. Player sprites
    for (const p of payload.players) {
      const sprite = this.add.sprite(p.userId === this.myUserId ? payload.spawn.x * TILE_SIZE : 25 * TILE_SIZE, p.userId === this.myUserId ? payload.spawn.y * TILE_SIZE : 25 * TILE_SIZE, "player");
      sprite.tint = COLOR_HEX[p.color] ?? 0xffffff;

      const text = this.add.text(sprite.x, sprite.y - 24, p.username, {
        fontSize: "10px",
        color: "#ffffff",
      });
      text.setOrigin(0.5);

      this.playerSprites[p.userId] = { sprite, usernameText: text };

      if (p.userId === this.myUserId) {
        this.myPlayer = sprite;
      }
    }

    // 3. Create animations
    this.createAnimations();

    // 4. Camera
    if (this.myPlayer) {
      this.cameras.main.startFollow(this.myPlayer, true);
      this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      this.cameras.main.setZoom(CAMERA_ZOOM);
    }

    // 5. Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;

    // 6. Socket listener
    const socket = getSocket();
    socket.on("game:tick", (data: GameTickPayload) => this.onTick(data));

    // 7. Fetch user ID if not set
    if (!this.myUserId) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            this.myUserId = data.user.id;
            this.game.registry.set("userId", this.myUserId);
            this.myPlayer = this.playerSprites[this.myUserId]?.sprite;
          }
        })
        .catch(() => {});
    }
  }

  private createAnimations(): void {
    // Frame layout: cols = [down, up, left, right], rows = [idle(0), walk(1)]
    const dirs = ["down", "up", "left", "right"];
    for (let d = 0; d < 4; d++) {
      const dir = dirs[d];
      this.anims.create({
        key: `idle-${dir}`,
        frames: [{ key: "player", frame: d * 2 }],
        frameRate: 1,
      });
      this.anims.create({
        key: `walk-${dir}`,
        frames: [{ key: "player", frame: d * 2 }, { key: "player", frame: d * 2 + 1 }],
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  update(time: number): void {
    if (!this.myPlayer) return;

    // 1. Input
    let dx = 0;
    let dy = 0;
    if (this.wasd.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.wasd.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.wasd.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.wasd.D.isDown || this.cursors.right.isDown) dx += 1;

    // 2. Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      dx *= DIAGONAL_FACTOR;
      dy *= DIAGONAL_FACTOR;
    }

    // 3. Send to server (throttled)
    if (time - this.lastInputSent > INPUT_SEND_INTERVAL_MS) {
      if (dx !== this.lastDx || dy !== this.lastDy) {
        const socket = getSocket();
        socket.emit("game:input", { dx, dy, seq: ++this.seqCounter });
      }
      this.lastInputSent = time;
      this.lastDx = dx;
      this.lastDy = dy;
    }

    // 4. Interpolate other players
    for (const [userId, ps] of Object.entries(this.playerSprites)) {
      if (userId === this.myUserId) continue;
      if (ps.targetX !== undefined) {
        ps.sprite.x = Phaser.Math.Linear(ps.sprite.x, ps.targetX, INTERP_FACTOR);
        ps.sprite.y = Phaser.Math.Linear(ps.sprite.y, ps.targetY!, INTERP_FACTOR);
      }
      ps.usernameText.setPosition(ps.sprite.x, ps.sprite.y - 24);
    }

    // 5. Update my animation
    let direction = "down";
    if (Math.abs(dy) > Math.abs(dx)) {
      direction = dy < 0 ? "up" : dy > 0 ? "down" : "down";
    } else if (dx !== 0) {
      direction = dx < 0 ? "left" : "right";
    }

    const moving = dx !== 0 || dy !== 0;
    const animKey = `${moving ? "walk" : "idle"}-${direction}`;
    if (this.myPlayer.anims.currentAnim?.key !== animKey) {
      this.myPlayer.play(animKey);
    }
  }

  private onTick(data: GameTickPayload): void {
    for (const p of data.players) {
      const ps = this.playerSprites[p.userId];
      if (!ps) continue;

      if (p.userId === this.myUserId) {
        // Server-authoritative: snap if drifted too far
        const serverX = p.x * TILE_SIZE;
        const serverY = p.y * TILE_SIZE;
        const drift = Math.abs(serverX - ps.sprite.x) + Math.abs(serverY - ps.sprite.y);
        if (drift > 10) {
          ps.sprite.setPosition(serverX, serverY);
        }
      } else {
        // Other player: set target for interpolation
        ps.targetX = p.x * TILE_SIZE;
        ps.targetY = p.y * TILE_SIZE;
      }
      ps.sprite.visible = p.isAlive;
    }
  }
}
```

- [ ] **Step 5: Vite build doğrula**

Run: `cd packages/client && npx vite build`
Expected: build başarılı (TypeScript compile)

- [ ] **Step 6: Commit**

```bash
git add packages/client/
git commit -m "feat(client): add GameScene with tilemap, WASD input, interpolation, and animations"
```

---

## Task 10: Docs + Tag + Manual Test Instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: `README.md` status güncelle**

```markdown
## Status

✅ **Sub-project 1:** Temel Kurulum + Auth
✅ **Sub-project 2:** Lobi Sistemi
✅ **Sub-project 3:** Oyun Çekirdeği (hareket, harita, roller)
- Lobby "BAŞLAT" → haritaya geçiş
- WASD hareket (sunucu otoriteri, 20Hz tick)
- Tiled tilemap (8 oda)
- Rol dağılımı (Impostor/Crew, gizli)
- Karakter sprite'ları (4 yön, animasyon)

🚧 **Sonraki:** Sub-project 4 — Görevler + Kill + Meeting (ilk TAM oynanabilir versiyon)
```

- [ ] **Step 2: Tüm testleri çalıştır**

```bash
cd packages/shared && npx vitest run
cd ../server && npx vitest run tests/game.roles.test.ts tests/game.engine.test.ts tests/game.map.test.ts tests/lobby.codes.test.ts tests/lobby.manager.test.ts
```

- [ ] **Step 3: Commit + tag**

```bash
git add -A
git commit -m "docs: complete Sub-project 3 documentation"
git tag sub-project-3-complete
```

---

## Sub-project 3 Tamamlama Kriterleri

- [ ] Shared: game constants + types + getImpostorCount (7 tests)
- [ ] Server: Prisma Match/MatchPlayer models + migration
- [ ] Server: assignRoles (6 tests)
- [ ] Server: map generator + wallGrid (5 tests)
- [ ] Server: GameEngine tick/movement/collision (~12 tests)
- [ ] Server: game socket handlers + lobby start wiring
- [ ] Server: tick loop (20Hz broadcast)
- [ ] Client: tileset + player sprite generation
- [ ] Client: Phaser config + BootScene
- [ ] Client: GameScene (tilemap, sprites, WASD, interpolation, animation)
- [ ] Client: lobby → game screen transition
- [ ] Tüm testler yeşil
- [ ] Tag `sub-project-3-complete`
