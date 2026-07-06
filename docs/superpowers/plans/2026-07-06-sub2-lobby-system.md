# Sub-project 2: Lobi Sistemi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Among Us klonu için Socket.io tabanlı realtime lobi sistemi — kullanıcılar oda oluşturur, kod ile katılır, renk seçer, hazırlanır ve host oyunu başlatır. Login + Menu + Lobby ekranları ile tam bir ön-deneyim.

**Architecture:** Backend'e Socket.io eklenir (Express HTTP server'a bağlı, JWT cookie auth). LobbyManager sınıfı in-memory `Map<code, Lobby>` tutar ve tüm oda işlemlerini yönetir. Client, Vite ile build edilen HTML/CSS + Vanilla TS SPA olur (login → menu → lobby ekranları). Production'da Express client/dist'i statik serve eder.

**Tech Stack:** Socket.io 4 (server + client), Vite 5, bcrypt (mevcut), jsonwebtoken (mevcut), zod (mevcut), vitest (mevcut).

## Global Constraints

- Node.js v24+, TypeScript strict mode
- ESM modules with .js extensions in imports (NodeNext/Bundler)
- All code in English (variables, functions, comments)
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)
- Every task ends with a commit
- TDD: failing test first, then implementation (where tests apply)
- bcrypt 10 rounds for lobby password hashing (reuse from auth)
- JWT cookie auth for Socket.io connections (reuse `verifyToken` from auth)
- Socket.io: `withCredentials: true` on client, CORS credentials on server
- Lobby state in-memory only (Map), NOT persisted to DB
- 12 colors, max 10 players, min 4 players to start
- Lobby code: 6 chars from `[A-Z2-9]` (no 0, 1, O, I for readability)

---

## File Structure (Sub-project 2'nin sonundaki durum)

```
amongus/
├── packages/
│   ├── shared/src/
│   │   ├── types.ts            # +LobbyState, LobbyPlayer, event payloads
│   │   ├── constants.ts        # +LOBBY_COLORS, MAX_PLAYERS, MIN_PLAYERS, CODE_CHARS
│   │   └── validation.ts       # +lobbyCreateSchema, lobbyJoinSchema
│   ├── server/src/
│   │   ├── sockets/
│   │   │   ├── index.ts        # setupSocketServer(httpServer) + auth middleware
│   │   │   └── lobbyHandlers.ts# registerLobbyHandlers(io, socket)
│   │   ├── lobby/
│   │   │   ├── manager.ts      # LobbyManager class (in-memory)
│   │   │   ├── types.ts        # Lobby, LobbyPlayer (server-internal)
│   │   │   └── codes.ts        # generateLobbyCode()
│   │   ├── app.ts              # +Express static serve (production)
│   │   └── index.ts            # +setupSocketServer(server)
│   ├── server/tests/
│   │   ├── lobby.codes.test.ts
│   │   ├── lobby.manager.test.ts
│   │   └── lobby.socket.test.ts
│   └── client/
│       ├── index.html          # Vite entry (SPA container)
│       ├── vite.config.ts      # Dev proxy → :3000
│       ├── package.json        # vite, socket.io-client
│       ├── tsconfig.json
│       ├── public/styles.css   # Among Us tarzı stiller
│       └── src/
│           ├── main.ts         # Vite entry → app.ts
│           ├── app.ts          # Screen manager (show/hide)
│           ├── screens/
│           │   ├── login.ts
│           │   ├── menu.ts
│           │   └── lobby.ts
│           ├── network/
│           │   ├── api.ts      # fetch wrapper (auth)
│           │   └── socket.ts   # Socket.io client singleton
│           └── types.ts        # Client-side types
└── packages/server/Dockerfile  # +client build stage
```

---

## Task 1: Shared — Lobby Tipler, Constants, Validation

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/validation.ts`
- Test: `packages/shared/src/lobby.test.ts`

**Interfaces:**
- Produces: `LOBBY_COLORS`, `MAX_PLAYERS`, `MIN_PLAYERS`, `LOBBY_CODE_CHARS`, `LOBBY_CODE_LENGTH`, `LobbyState`, `LobbyPlayerState`, `LobbyEvent` types, `lobbyCreateSchema`, `lobbyJoinSchema`
- Consumes: existing zod

- [ ] **Step 1: `constants.ts`'ye lobby sabitleri ekle**

`packages/shared/src/constants.ts` dosyasının sonuna şunu ekle:

```typescript

// ─── Lobby configuration ──────────────────────────────────────────────

/** 12 player colors. Each can be claimed by only one player per lobby. */
export const LOBBY_COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
] as const;

export type LobbyColor = (typeof LOBBY_COLORS)[number];

/** Max players in a lobby (Among Us standard) */
export const MAX_PLAYERS = 10;

/** Min players required to start a game */
export const MIN_PLAYERS = 4;

/** Characters used for lobby codes: A-Z and 2-9 (no 0, 1, O, I for readability) */
export const LOBBY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Lobby code length */
export const LOBBY_CODE_LENGTH = 6;
```

- [ ] **Step 2: `types.ts`'ye lobby tipleri ekle**

`packages/shared/src/types.ts` dosyasının sonuna şunu ekle:

```typescript

// ─── Lobby types ──────────────────────────────────────────────────────

/** A player as seen by the client (no socketId/joinedAt — those are server-internal). */
export interface LobbyPlayerState {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
}

/** Full lobby state sent to clients. */
export interface LobbyState {
  code: string;
  hostId: string;
  hasPassword: boolean;
  players: LobbyPlayerState[];
  status: "LOBBY" | "STARTING";
  maxPlayers: number;
}

/** Server → client error event payload. */
export interface LobbyErrorPayload {
  code: string;
  message: string;
}

/** lobby:started event payload. */
export interface LobbyStartedPayload {
  code: string;
}

/** Lobby event names (shared between client and server). */
export const LOBBY_EVENTS = {
  // Client → Server
  CREATE: "lobby:create",
  JOIN: "lobby:join",
  LEAVE: "lobby:leave",
  TOGGLE_READY: "lobby:toggleReady",
  SET_COLOR: "lobby:setColor",
  START: "lobby:start",
  // Server → Client
  STATE: "lobby:state",
  UPDATED: "lobby:updated",
  ERROR: "lobby:error",
  STARTED: "lobby:started",
} as const;
```

- [ ] **Step 3: `validation.ts`'ye lobby şemaları ekle**

`packages/shared/src/validation.ts` dosyasının sonuna şunu ekle:

```typescript

// ─── Lobby validation schemas ─────────────────────────────────────────

export const lobbyCreateSchema = z.object({
  password: z.string().min(1).max(100).optional(),
});

export const lobbyJoinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(6, "Lobby code must be 6 characters"),
  password: z.string().min(1).max(100).optional(),
});

export const lobbySetColorSchema = z.object({
  color: z.string().min(1).max(20),
});
```

- [ ] **Step 4: Failing test yaz — `packages/shared/src/lobby.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  LOBBY_COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  LOBBY_CODE_CHARS,
  LOBBY_CODE_LENGTH,
  LOBBY_EVENTS,
} from "./constants.js";
import { lobbyCreateSchema, lobbyJoinSchema, lobbySetColorSchema } from "./validation.js";

describe("lobby constants", () => {
  it("has exactly 12 colors", () => {
    expect(LOBBY_COLORS.length).toBe(12);
  });

  it("has max players 10 and min players 4", () => {
    expect(MAX_PLAYERS).toBe(10);
    expect(MIN_PLAYERS).toBe(4);
  });

  it("excludes ambiguous chars 0, 1, O, I from code chars", () => {
    expect(LOBBY_CODE_CHARS).not.toContain("0");
    expect(LOBBY_CODE_CHARS).not.toContain("1");
    expect(LOBBY_CODE_CHARS).not.toContain("O");
    expect(LOBBY_CODE_CHARS).not.toContain("I");
    expect(LOBBY_CODE_LENGTH).toBe(6);
  });

  it("defines all lobby event names", () => {
    expect(LOBBY_EVENTS.CREATE).toBe("lobby:create");
    expect(LOBBY_EVENTS.JOIN).toBe("lobby:join");
    expect(LOBBY_EVENTS.STATE).toBe("lobby:state");
    expect(LOBBY_EVENTS.STARTED).toBe("lobby:started");
  });
});

describe("lobbyCreateSchema", () => {
  it("accepts empty object (no password)", () => {
    expect(lobbyCreateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts optional password", () => {
    expect(lobbyCreateSchema.safeParse({ password: "secret" }).success).toBe(true);
  });

  it("rejects empty password string", () => {
    expect(lobbyCreateSchema.safeParse({ password: "" }).success).toBe(false);
  });
});

describe("lobbyJoinSchema", () => {
  it("accepts valid 6-char code", () => {
    const r = lobbyJoinSchema.safeParse({ code: "ABC234" });
    expect(r.success).toBe(true);
  });

  it("uppercases the code", () => {
    const r = lobbyJoinSchema.safeParse({ code: "abc234" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe("ABC234");
  });

  it("rejects code with wrong length", () => {
    expect(lobbyJoinSchema.safeParse({ code: "ABC" }).success).toBe(false);
    expect(lobbyJoinSchema.safeParse({ code: "ABCDEFGH" }).success).toBe(false);
  });
});

describe("lobbySetColorSchema", () => {
  it("accepts a color string", () => {
    expect(lobbySetColorSchema.safeParse({ color: "red" }).success).toBe(true);
  });

  it("rejects missing color", () => {
    expect(lobbySetColorSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 5: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/shared && npx vitest run src/lobby.test.ts`
Expected: PASS — 12 test yeşil

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add lobby types, constants, and validation schemas"
```

---

## Task 2: Server — Lobby Code Generator

**Files:**
- Create: `packages/server/src/lobby/codes.ts`
- Test: `packages/server/tests/lobby.codes.test.ts`

**Interfaces:**
- Produces: `generateLobbyCode(): string` — 6 haneli benzersiz-olabilecek kod (caller benzersizliği Map'te kontrol eder)
- Consumes: `LOBBY_CODE_CHARS`, `LOBBY_CODE_LENGTH` from `@amongus/shared`

- [ ] **Step 1: Failing test yaz — `packages/server/tests/lobby.codes.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { generateLobbyCode } from "../src/lobby/codes.js";
import { LOBBY_CODE_CHARS, LOBBY_CODE_LENGTH } from "@amongus/shared";

describe("generateLobbyCode", () => {
  it("returns a string of the correct length", () => {
    const code = generateLobbyCode();
    expect(code.length).toBe(LOBBY_CODE_LENGTH);
  });

  it("only uses allowed characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLobbyCode();
      for (const char of code) {
        expect(LOBBY_CODE_CHARS).toContain(char);
      }
    }
  });

  it("produces different codes across many calls (randomness)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateLobbyCode());
    }
    // With 32^6 ≈ 1B space, 100 codes should be near-unique
    expect(codes.size).toBeGreaterThan(95);
  });
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu doğrula**

Run: `cd packages/server && npx vitest run tests/lobby.codes.test.ts`
Expected: FAIL — `Cannot find module '../src/lobby/codes.js'`

- [ ] **Step 3: Implementation — `packages/server/src/lobby/codes.ts`**

```typescript
import { LOBBY_CODE_CHARS, LOBBY_CODE_LENGTH } from "@amongus/shared";

/**
 * Generate a random lobby code of 6 characters from the allowed charset
 * (A-Z without O, I and digits 2-9). Uniqueness is enforced by the caller
 * (LobbyManager checks the Map before accepting).
 */
export function generateLobbyCode(): string {
  let code = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * LOBBY_CODE_CHARS.length);
    code += LOBBY_CODE_CHARS[idx];
  }
  return code;
}
```

- [ ] **Step 4: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/server && npx vitest run tests/lobby.codes.test.ts`
Expected: PASS — 3 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lobby/codes.ts packages/server/tests/lobby.codes.test.ts
git commit -m "feat(server): add lobby code generator with allowed charset"
```

---

## Task 3: Server — Lobby Types (Server-Internal)

**Files:**
- Create: `packages/server/src/lobby/types.ts`

**Interfaces:**
- Produces: `Lobby`, `LobbyPlayer` (server-internal, include socketId/joinedAt)
- Consumes: nothing

- [ ] **Step 1: Implementation — `packages/server/src/lobby/types.ts`**

```typescript
// Server-internal lobby types. These include socketId and joinedAt which
// are NOT sent to clients (see toLobbyState() in manager.ts for the mapping).

export interface LobbyPlayer {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
  socketId: string;
  joinedAt: number;
}

export interface Lobby {
  code: string;
  hostId: string;
  passwordHash?: string;
  players: LobbyPlayer[];
  status: "LOBBY" | "STARTING";
  createdAt: number;
  maxPlayers: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/lobby/types.ts
git commit -m "feat(server): add server-internal lobby types"
```

---

## Task 4: Server — LobbyManager Class (Core Logic, TDD)

**Files:**
- Create: `packages/server/src/lobby/manager.ts`
- Test: `packages/server/tests/lobby.manager.test.ts`

**Interfaces:**
- Produces: `LobbyManager` class with methods:
  - `createLobby(host: { userId, username, socketId }, password?: string): { lobby: Lobby; code: string }`
  - `joinLobby(code: string, player: { userId, username, socketId }, password?: string): { lobby: Lobby } | { error: LobbyErrorCode }`
  - `leaveLobby(userId: string): { lobby?: Lobby; removed: boolean }`
  - `toggleReady(userId: string): { lobby?: Lobby } | { error: LobbyErrorCode }`
  - `setColor(userId: string, color: string): { lobby?: Lobby } | { error: LobbyErrorCode }`
  - `startLobby(userId: string): { lobby?: Lobby } | { error: LobbyErrorCode }`
  - `getLobbyBySocket(socketId: string): Lobby | undefined`
  - `getLobbyByCode(code: string): Lobby | undefined`
  - `getLobbyByUser(userId: string): Lobby | undefined`
  - `toLobbyState(lobby: Lobby): LobbyState` (strips socketId/joinedAt/passwordHash)
- Consumes: `Lobby`, `LobbyPlayer` (Task 3), `generateLobbyCode` (Task 2), `hashPassword`/`verifyPassword` (auth), shared constants

- [ ] **Step 1: Failing test yaz — `packages/server/tests/lobby.manager.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { LobbyManager } from "../src/lobby/manager.js";
import { MAX_PLAYERS, MIN_PLAYERS } from "@amongus/shared";

describe("LobbyManager", () => {
  let mgr: LobbyManager;

  beforeEach(() => {
    mgr = new LobbyManager();
  });

  const host = { userId: "u1", username: "alice", socketId: "s1" };
  const guest = { userId: "u2", username: "bob", socketId: "s2" };

  describe("createLobby", () => {
    it("creates a lobby with the creator as host", () => {
      const result = mgr.createLobby(host);
      expect(result.code).toHaveLength(6);
      expect(result.lobby.hostId).toBe("u1");
      expect(result.lobby.players).toHaveLength(1);
      expect(result.lobby.players[0].isHost).toBe(true);
      expect(result.lobby.players[0].color).toBe("red"); // first color assigned
      expect(result.lobby.status).toBe("LOBBY");
    });

    it("generates unique codes across multiple lobbies", () => {
      const r1 = mgr.createLobby(host);
      const r2 = mgr.createLobby({ userId: "u3", username: "carol", socketId: "s3" });
      expect(r1.code).not.toBe(r2.code);
    });

    it("rejects if user is already in a lobby", () => {
      mgr.createLobby(host);
      const result = mgr.createLobby(host);
      expect(result).toHaveProperty("error");
    });

    it("hashes the password when provided", () => {
      const result = mgr.createLobby(host, "secret");
      expect(result.lobby.passwordHash).toBeDefined();
      expect(result.lobby.passwordHash).not.toBe("secret");
    });
  });

  describe("joinLobby", () => {
    beforeEach(() => {
      mgr.createLobby(host);
    });

    it("adds a player to an existing lobby", () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = mgr.joinLobby(code, guest);
      expect(result).toHaveProperty("lobby");
      if ("lobby" in result) {
        expect(result.lobby.players).toHaveLength(2);
      }
    });

    it("assigns next available color", () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = mgr.joinLobby(code, guest);
      if ("lobby" in result) {
        const bob = result.lobby.players.find((p) => p.userId === "u2");
        expect(bob?.color).toBe("blue");
      }
    });

    it("fails for non-existent code", () => {
      const result = mgr.joinLobby("ZZZZZZ", guest);
      expect(result).toEqual({ error: "not_found" });
    });

    it("fails when lobby is full", () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      for (let i = 2; i <= MAX_PLAYERS; i++) {
        mgr.joinLobby(code, { userId: `u${i}`, username: `p${i}`, socketId: `s${i}` });
      }
      const result = mgr.joinLobby(code, { userId: "u99", username: "overflow", socketId: "s99" });
      expect(result).toEqual({ error: "full" });
    });

    it("fails when user is already in a lobby", () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.joinLobby(code, guest);
      // bob tries to join again
      const result = mgr.joinLobby(code, guest);
      expect(result).toHaveProperty("error");
    });

    it("fails with wrong password", () => {
      mgr = new LobbyManager();
      mgr.createLobby(host, "correct");
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = mgr.joinLobby(code, guest, "wrong");
      expect(result).toEqual({ error: "wrong_password" });
    });

    it("succeeds with correct password", () => {
      mgr = new LobbyManager();
      mgr.createLobby(host, "correct");
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = mgr.joinLobby(code, guest, "correct");
      expect(result).toHaveProperty("lobby");
    });
  });

  describe("leaveLobby", () => {
    it("removes a player from their lobby", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.joinLobby(code, guest);
      const result = mgr.leaveLobby("u2");
      expect(result.removed).toBe(true);
      const lobby = mgr.getLobbyByCode(code);
      expect(lobby?.players).toHaveLength(1);
    });

    it("transfers host when host leaves", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.joinLobby(code, guest);
      mgr.leaveLobby("u1"); // host leaves
      const lobby = mgr.getLobbyByCode(code);
      expect(lobby?.hostId).toBe("u2");
      expect(lobby?.players[0].isHost).toBe(true);
    });

    it("deletes lobby when last player leaves", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.leaveLobby("u1");
      expect(mgr.getLobbyByCode(code)).toBeUndefined();
    });

    it("returns removed:false if user not in a lobby", () => {
      const result = mgr.leaveLobby("nobody");
      expect(result.removed).toBe(false);
    });
  });

  describe("toggleReady", () => {
    it("flips ready state", () => {
      mgr.createLobby(host);
      const r1 = mgr.toggleReady("u1");
      if ("lobby" in r1) {
        expect(r1.lobby.players[0].isReady).toBe(true);
      }
      const r2 = mgr.toggleReady("u1");
      if ("lobby" in r2) {
        expect(r2.lobby.players[0].isReady).toBe(false);
      }
    });
  });

  describe("setColor", () => {
    it("changes the player's color if available", () => {
      mgr.createLobby(host);
      const result = mgr.setColor("u1", "blue");
      if ("lobby" in result) {
        expect(result.lobby.players[0].color).toBe("blue");
      }
    });

    it("fails if color is taken by another player", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.joinLobby(code, guest); // bob gets "blue"
      const result = mgr.setColor("u1", "blue");
      expect(result).toEqual({ error: "color_taken" });
    });

    it("fails for invalid color name", () => {
      mgr.createLobby(host);
      const result = mgr.setColor("u1", "rainbow");
      expect(result).toEqual({ error: "invalid_color" });
    });
  });

  describe("startLobby", () => {
    it("fails if caller is not host", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      mgr.joinLobby(code, guest);
      const result = mgr.startLobby("u2");
      expect(result).toEqual({ error: "not_host" });
    });

    it("fails if fewer than MIN_PLAYERS", () => {
      mgr.createLobby(host);
      const result = mgr.startLobby("u1");
      expect(result).toEqual({ error: "not_enough_players" });
    });

    it("succeeds and sets status to STARTING", () => {
      mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      for (let i = 2; i <= MIN_PLAYERS; i++) {
        mgr.joinLobby(code, { userId: `u${i}`, username: `p${i}`, socketId: `s${i}` });
      }
      const result = mgr.startLobby("u1");
      if ("lobby" in result) {
        expect(result.lobby.status).toBe("STARTING");
      } else {
        throw new Error("expected lobby, got error: " + JSON.stringify(result));
      }
    });
  });

  describe("toLobbyState", () => {
    it("strips socketId, joinedAt, and passwordHash", () => {
      const { lobby } = mgr.createLobby(host, "secret");
      const state = mgr.toLobbyState(lobby);
      expect(state.players[0]).not.toHaveProperty("socketId");
      expect(state.players[0]).not.toHaveProperty("joinedAt");
      expect(state).not.toHaveProperty("passwordHash");
      expect(state.hasPassword).toBe(true);
    });
  });

  describe("disconnect handling", () => {
    it("removes player by socketId", () => {
      mgr.createLobby(host);
      const result = mgr.leaveLobbyBySocket("s1");
      expect(result.removed).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu doğrula**

Run: `cd packages/server && npx vitest run tests/lobby.manager.test.ts`
Expected: FAIL — `Cannot find module '../src/lobby/manager.js'`

- [ ] **Step 3: Implementation — `packages/server/src/lobby/manager.ts`**

```typescript
import { LOBBY_COLORS, MAX_PLAYERS, MIN_PLAYERS } from "@amongus/shared";
import { generateLobbyCode } from "./codes.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { Lobby, LobbyPlayer } from "./types.js";
import type { LobbyState, LobbyPlayerState } from "@amongus/shared";

export type LobbyErrorCode =
  | "already_in_lobby"
  | "not_found"
  | "full"
  | "wrong_password"
  | "not_in_lobby"
  | "color_taken"
  | "invalid_color"
  | "not_host"
  | "not_enough_players"
  | "already_starting";

export type LobbyResult = { lobby: Lobby } | { error: LobbyErrorCode };

interface PlayerRef {
  userId: string;
  username: string;
  socketId: string;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private userIndex = new Map<string, string>(); // userId → code

  // Async because hashPassword (bcrypt) is async
  async createLobby(
    host: PlayerRef,
    password?: string
  ): Promise<{ lobby: Lobby; code: string } | { error: LobbyErrorCode }> {
    if (this.userIndex.has(host.userId)) {
      return { error: "already_in_lobby" };
    }
    let code = generateLobbyCode();
    while (this.lobbies.has(code)) {
      code = generateLobbyCode();
    }
    const player: LobbyPlayer = {
      userId: host.userId,
      username: host.username,
      color: LOBBY_COLORS[0],
      isReady: false,
      isHost: true,
      socketId: host.socketId,
      joinedAt: Date.now(),
    };
    const lobby: Lobby = {
      code,
      hostId: host.userId,
      players: [player],
      status: "LOBBY",
      createdAt: Date.now(),
      maxPlayers: MAX_PLAYERS,
    };
    if (password) {
      lobby.passwordHash = await hashPassword(password);
    }
    this.lobbies.set(code, lobby);
    this.userIndex.set(host.userId, code);
    return { lobby, code };
  }

  // Async because password verification (bcrypt) is async
  async joinLobby(
    code: string,
    player: PlayerRef,
    password?: string
  ): Promise<LobbyResult> {
    if (this.userIndex.has(player.userId)) {
      return { error: "already_in_lobby" };
    }
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      return { error: "not_found" };
    }
    if (lobby.players.length >= lobby.maxPlayers) {
      return { error: "full" };
    }
    if (lobby.passwordHash) {
      if (!password) return { error: "wrong_password" };
      const valid = await verifyPassword(password, lobby.passwordHash);
      if (!valid) return { error: "wrong_password" };
    }
    const takenColors = new Set(lobby.players.map((p) => p.color));
    const freeColor = LOBBY_COLORS.find((c) => !takenColors.has(c)) ?? LOBBY_COLORS[0];
    const newPlayer: LobbyPlayer = {
      userId: player.userId,
      username: player.username,
      color: freeColor,
      isReady: false,
      isHost: false,
      socketId: player.socketId,
      joinedAt: Date.now(),
    };
    lobby.players.push(newPlayer);
    this.userIndex.set(player.userId, code);
    return { lobby };
  }

  leaveLobby(userId: string): { lobby?: Lobby; removed: boolean } {
    const code = this.userIndex.get(userId);
    if (!code) return { removed: false };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { removed: false };
    lobby.players = lobby.players.filter((p) => p.userId !== userId);
    this.userIndex.delete(userId);
    if (lobby.players.length === 0) {
      this.lobbies.delete(code);
      return { removed: true };
    }
    if (lobby.hostId === userId) {
      this.transferHost(lobby);
    }
    return { lobby, removed: true };
  }

  leaveLobbyBySocket(socketId: string): { lobby?: Lobby; removed: boolean } {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.find((p) => p.socketId === socketId);
      if (player) {
        return this.leaveLobby(player.userId);
      }
    }
    return { removed: false };
  }

  private transferHost(lobby: Lobby): void {
    const earliest = lobby.players.reduce((min, p) => (p.joinedAt < min.joinedAt ? p : min));
    earliest.isHost = true;
    lobby.hostId = earliest.userId;
    for (const p of lobby.players) {
      if (p.userId !== earliest.userId) p.isHost = false;
    }
  }

  toggleReady(userId: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) return { error: "not_in_lobby" };
    player.isReady = !player.isReady;
    return { lobby };
  }

  setColor(userId: string, color: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    if (!LOBBY_COLORS.includes(color as never)) {
      return { error: "invalid_color" };
    }
    const taken = lobby.players.find((p) => p.color === color && p.userId !== userId);
    if (taken) {
      return { error: "color_taken" };
    }
    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) return { error: "not_in_lobby" };
    player.color = color;
    return { lobby };
  }

  startLobby(userId: string): LobbyResult {
    const code = this.userIndex.get(userId);
    if (!code) return { error: "not_in_lobby" };
    const lobby = this.lobbies.get(code);
    if (!lobby) return { error: "not_in_lobby" };
    if (lobby.hostId !== userId) return { error: "not_host" };
    if (lobby.status === "STARTING") return { error: "already_starting" };
    if (lobby.players.length < MIN_PLAYERS) return { error: "not_enough_players" };
    lobby.status = "STARTING";
    return { lobby };
  }

  getLobbyByCode(code: string): Lobby | undefined {
    return this.lobbies.get(code);
  }

  getLobbyByUser(userId: string): Lobby | undefined {
    const code = this.userIndex.get(userId);
    if (!code) return undefined;
    return this.lobbies.get(code);
  }

  getLobbyBySocket(socketId: string): Lobby | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.players.some((p) => p.socketId === socketId)) {
        return lobby;
      }
    }
    return undefined;
  }

  toLobbyState(lobby: Lobby): LobbyState {
    const players: LobbyPlayerState[] = lobby.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      color: p.color,
      isReady: p.isReady,
      isHost: p.isHost,
    }));
    return {
      code: lobby.code,
      hostId: lobby.hostId,
      hasPassword: !!lobby.passwordHash,
      players,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
    };
  }
}
```

**Important note on async:** `createLobby` and `joinLobby` are async because bcrypt's `hashPassword`/`verifyPassword` are async. The test must `await` all calls to these two methods and mark test functions `async`:

```typescript
// All createLobby/joinLobby calls in tests must be awaited:
it("creates a lobby with the creator as host", async () => {
  const result = await mgr.createLobby(host);
  // ...
});
```

In the test file (`lobby.manager.test.ts`), update ALL `createLobby`/`joinLobby` calls to use `await`, and mark all `it(...)` callbacks that call them as `async`. The other methods (`leaveLobby`, `toggleReady`, `setColor`, `startLobby`) remain synchronous.

The socket handlers (Task 5) already call these methods with `await` since they're in `async` handlers.

- [ ] **Step 4: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/server && npx vitest run tests/lobby.manager.test.ts`
Expected: PASS — ~20 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lobby/manager.ts packages/server/tests/lobby.manager.test.ts
git commit -m "feat(server): add LobbyManager with full lobby logic and tests"
```

---

## Task 5: Server — Socket.io Server + Auth Middleware

**Files:**
- Create: `packages/server/src/sockets/index.ts`
- Modify: `packages/server/package.json` (add socket.io dep)
- Modify: `packages/server/src/index.ts` (wire socket server)
- Modify: `packages/server/src/app.ts` (export the HTTP server for socket binding)
- Test: `packages/server/tests/socket.auth.test.ts`

**Interfaces:**
- Produces: `setupSocketServer(httpServer, lobbyManager)` — attaches Socket.io with JWT auth middleware
- Consumes: `verifyToken` (auth), `AUTH_COOKIE_NAME` (shared)

- [ ] **Step 1: `socket.io` bağımlılığını ekle**

`packages/server/package.json`'da `dependencies`'e ekle:
```json
"socket.io": "^4.7.5"
```
Ve `devDependencies`'e:
```json
"socket.io-client": "^4.7.5"
```

Run: `cd packages/server && npm install`

- [ ] **Step 2: Auth middleware'lı Socket server — `packages/server/src/sockets/index.ts`**

```typescript
import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "node:http";
import type { ExtendedIo, ExtendedSocket } from "./types.js";
import { AUTH_COOKIE_NAME } from "@amongus/shared";
import { verifyToken } from "../auth/jwt.js";
import type { LobbyManager } from "../lobby/manager.js";
import { registerLobbyHandlers } from "./lobbyHandlers.js";
import cookieParser from "cookie-parser";

/**
 * Parse cookies from a raw Cookie header string (Socket.io doesn't use Express middleware).
 */
function parseCookies(rawCookie?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!rawCookie) return cookies;
  for (const part of rawCookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(v.join("="));
  }
  return cookies;
}

export function setupSocketServer(httpServer: HTTPServer, lobbyManager: LobbyManager): ExtendedIo {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    },
  }) as ExtendedIo;

  // Auth middleware: verify JWT from cookie on every connection
  io.use((socket: ExtendedSocket, next) => {
    const rawCookie = socket.request.headers.cookie;
    const cookies = parseCookies(rawCookie);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) {
      return next(new Error("unauthorized"));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error("invalid_token"));
    }
    socket.data.user = payload;
    next();
  });

  io.on("connection", (socket: ExtendedSocket) => {
    registerLobbyHandlers(io, socket, lobbyManager);

    socket.on("disconnect", () => {
      const result = lobbyManager.leaveLobbyBySocket(socket.id);
      if (result.lobby) {
        const state = lobbyManager.toLobbyState(result.lobby);
        io.to(result.lobby.code).emit("lobby:updated", state);
      }
    });
  });

  return io;
}
```

- [ ] **Step 3: Socket tipleri — `packages/server/src/sockets/types.ts`**

```typescript
import type { Server as SocketIOServer, Socket } from "socket.io";
import type { JwtPayload } from "../auth/jwt.js";

export interface ExtendedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

export interface ExtendedIo extends SocketIOServer {
  // Extended for typing; same as base for now
}
```

- [ ] **Step 4: Lobby event handler'ları — `packages/server/src/sockets/lobbyHandlers.ts`**

```typescript
import type { Server as SocketIOServer } from "socket.io";
import type { ExtendedSocket, ExtendedIo } from "./types.js";
import type { LobbyManager, LobbyErrorCode } from "../lobby/manager.js";
import { LOBBY_EVENTS, lobbyCreateSchema, lobbyJoinSchema, lobbySetColorSchema } from "@amongus/shared";

export function registerLobbyHandlers(
  io: ExtendedIo,
  socket: ExtendedSocket,
  mgr: LobbyManager
): void {
  const user = socket.data.user;

  socket.on(LOBBY_EVENTS.CREATE, async (payload: unknown) => {
    const parsed = lobbyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid input" });
      return;
    }
    const result = await mgr.createLobby(
      { userId: user.userId, username: user.username, socketId: socket.id },
      parsed.data.password
    );
    if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
      return;
    }
    socket.join(result.code);
    socket.emit(LOBBY_EVENTS.STATE, mgr.toLobbyState(result.lobby));
  });

  socket.on(LOBBY_EVENTS.JOIN, async (payload: unknown) => {
    const parsed = lobbyJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid lobby code" });
      return;
    }
    const result = await mgr.joinLobby(
      parsed.data.code,
      { userId: user.userId, username: user.username, socketId: socket.id },
      parsed.data.password
    );
    if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
      return;
    }
    socket.join(result.lobby.code);
    socket.emit(LOBBY_EVENTS.STATE, mgr.toLobbyState(result.lobby));
    io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
  });

  socket.on(LOBBY_EVENTS.LEAVE, () => {
    const result = mgr.leaveLobby(user.userId);
    if (result.lobby) {
      socket.leave(result.lobby.code);
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    }
  });

  socket.on(LOBBY_EVENTS.TOGGLE_READY, () => {
    const result = mgr.toggleReady(user.userId);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
    }
  });

  socket.on(LOBBY_EVENTS.SET_COLOR, (payload: unknown) => {
    const parsed = lobbySetColorSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: "validation_error", message: "Invalid color" });
      return;
    }
    const result = mgr.setColor(user.userId, parsed.data.color);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
    }
  });

  socket.on(LOBBY_EVENTS.START, () => {
    const result = mgr.startLobby(user.userId);
    if ("lobby" in result && result.lobby) {
      io.to(result.lobby.code).emit(LOBBY_EVENTS.UPDATED, mgr.toLobbyState(result.lobby));
      io.to(result.lobby.code).emit(LOBBY_EVENTS.STARTED, { code: result.lobby.code });
    } else if ("error" in result) {
      socket.emit(LOBBY_EVENTS.ERROR, { code: result.error, message: errorToMessage(result.error) });
    }
  });
}

function errorToMessage(code: LobbyErrorCode): string {
  const messages: Record<LobbyErrorCode, string> = {
    already_in_lobby: "You are already in a lobby",
    not_found: "Lobby not found",
    full: "Lobby is full",
    wrong_password: "Wrong password",
    not_in_lobby: "You are not in a lobby",
    color_taken: "That color is already taken",
    invalid_color: "Invalid color",
    not_host: "Only the host can start the game",
    not_enough_players: `Need at least ${4} players to start`,
    already_starting: "Game is already starting",
  };
  return messages[code];
}
```

- [ ] **Step 5: `index.ts`'yi güncelle — socket server'ı bağla**

`packages/server/src/index.ts` dosyasını şununla değiştir:

```typescript
import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { setupSocketServer } from "./sockets/index.js";
import { LobbyManager } from "./lobby/manager.js";

async function main(): Promise<void> {
  try {
    await prisma.$connect();
    console.log(`[server] Connected to database`);
  } catch (err) {
    console.error("[server] Failed to connect to database:", err);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] Among Us API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
  });

  // Lobby system
  const lobbyManager = new LobbyManager();
  setupSocketServer(server, lobbyManager);
  console.log(`[server] Socket.io lobby system initialized`);

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Failing auth test yaz — `packages/server/tests/socket.auth.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { io as ioc } from "socket.io-client";
import { createApp } from "../src/app.js";
import { setupSocketServer } from "../src/sockets/index.js";
import { signToken } from "../src/auth/jwt.js";
import { AUTH_COOKIE_NAME } from "@amongus/shared";
import { LobbyManager } from "../src/lobby/manager.js";

const httpServer = createServer(createApp());
const mgr = new LobbyManager();

beforeAll(() => {
  setupSocketServer(httpServer, mgr);
  httpServer.listen(0); // random port
});

afterAll(() => {
  httpServer.close();
});

function getPort(): number {
  const addr = httpServer.address();
  if (typeof addr === "object" && addr) return addr.port;
  throw new Error("no port");
}

describe("socket auth middleware", () => {
  it("rejects connection without token", async () => {
    const port = getPort();
    const client = ioc(`http://localhost:${port}`, { forceNew: true });
    const err = await new Promise<string>((resolve) => {
      client.on("connect_error", (e) => resolve(e.message));
    });
    expect(err).toBe("unauthorized");
    client.close();
  });

  it("rejects connection with invalid token", async () => {
    const port = getPort();
    const client = ioc(`http://localhost:${port}`, {
      forceNew: true,
      extraHeaders: { Cookie: `${AUTH_COOKIE_NAME}=invalid.token.here` },
    });
    const err = await new Promise<string>((resolve) => {
      client.on("connect_error", (e) => resolve(e.message));
    });
    expect(err).toBe("invalid_token");
    client.close();
  });

  it("accepts connection with valid token", async () => {
    const token = signToken({ userId: "u-test", username: "tester" });
    const port = getPort();
    const client = ioc(`http://localhost:${port}`, {
      forceNew: true,
      extraHeaders: { Cookie: `${AUTH_COOKIE_NAME}=${token}` },
    });
    const connected = await new Promise<boolean>((resolve) => {
      client.on("connect", () => resolve(true));
      client.on("connect_error", () => resolve(false));
    });
    expect(connected).toBe(true);
    client.close();
  });
});
```

- [ ] **Step 7: Test'i çalıştır**

Run: `cd packages/server && npx vitest run tests/socket.auth.test.ts`
Expected: PASS — 3 test yeşil

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/sockets/ packages/server/src/index.ts packages/server/package.json packages/server/tests/socket.auth.test.ts
git commit -m "feat(server): add Socket.io server with JWT auth middleware and lobby handlers"
```

---

## Task 6: Server — Socket Lobby Integration Test

**Files:**
- Test: `packages/server/tests/lobby.socket.test.ts`

**Interfaces:**
- Tests: 2-client flow — create, join, color, ready, host-leave transfer, disconnect

- [ ] **Step 1: Integration test yaz — `packages/server/tests/lobby.socket.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { io as ioc } from "socket.io-client";
import { createApp } from "../src/app.js";
import { setupSocketServer } from "../src/sockets/index.js";
import { signToken } from "../src/auth/jwt.js";
import { AUTH_COOKIE_NAME, LOBBY_EVENTS } from "@amongus/shared";
import { LobbyManager } from "../src/lobby/manager.js";

const httpServer = createServer(createApp());
const mgr = new LobbyManager();
const port = 0;
let actualPort = 0;

beforeAll((done) => {
  setupSocketServer(httpServer, mgr);
  httpServer.listen(0, () => {
    const addr = httpServer.address();
    actualPort = typeof addr === "object" && addr ? addr.port : 0;
    done();
  });
});

afterAll(() => httpServer.close());

function makeClient(userId: string, username: string) {
  const token = signToken({ userId, username });
  return ioc(`http://localhost:${actualPort}`, {
    forceNew: true,
    extraHeaders: { Cookie: `${AUTH_COOKIE_NAME}=${token}` },
  });
}

function waitFor<T>(client: any, event: string, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("lobby socket integration", () => {
  it("full flow: create → join → set color → toggle ready → leave (host transfer)", async () => {
    const host = makeClient("int-u1", "alice");
    await waitFor(host, "connect");

    // Host creates lobby
    host.emit(LOBBY_EVENTS.CREATE, {});
    const state1 = await waitFor<any>(host, LOBBY_EVENTS.STATE);
    expect(state1.code).toHaveLength(6);
    expect(state1.players[0].username).toBe("alice");
    const code = state1.code;

    // Guest joins
    const guest = makeClient("int-u2", "bob");
    await waitFor(guest, "connect");
    guest.emit(LOBBY_EVENTS.JOIN, { code });

    const [hostUpdate1, guestState] = await Promise.all([
      waitFor<any>(host, LOBBY_EVENTS.UPDATED),
      waitFor<any>(guest, LOBBY_EVENTS.STATE),
    ]);
    expect(guestState.players).toHaveLength(2);
    expect(hostUpdate1.players).toHaveLength(2);

    // Guest changes color
    guest.emit(LOBBY_EVENTS.SET_COLOR, { color: "green" });
    const update2 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED);
    const bob = update2.players.find((p: any) => p.username === "bob");
    expect(bob.color).toBe("green");

    // Guest toggles ready
    guest.emit(LOBBY_EVENTS.TOGGLE_READY);
    const update3 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED);
    const bob2 = update3.players.find((p: any) => p.username === "bob");
    expect(bob2.isReady).toBe(true);

    // Host leaves → guest becomes host
    host.emit(LOBBY_EVENTS.LEAVE);
    const update4 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED);
    const newHost = update4.players.find((p: any) => p.username === "bob");
    expect(newHost.isHost).toBe(true);

    host.close();
    guest.close();
  }, 15000);

  it("rejects join with wrong code", async () => {
    const client = makeClient("int-u3", "carol");
    await waitFor(client, "connect");
    client.emit(LOBBY_EVENTS.JOIN, { code: "ZZZZZZ" });
    const err = await waitFor<any>(client, LOBBY_EVENTS.ERROR);
    expect(err.code).toBe("not_found");
    client.close();
  });

  it("rejects start with too few players", async () => {
    const client = makeClient("int-u4", "dave");
    await waitFor(client, "connect");
    client.emit(LOBBY_EVENTS.CREATE, {});
    await waitFor<any>(client, LOBBY_EVENTS.STATE);
    client.emit(LOBBY_EVENTS.START);
    const err = await waitFor<any>(client, LOBBY_EVENTS.ERROR);
    expect(err.code).toBe("not_enough_players");
    client.close();
  });
});
```

- [ ] **Step 2: Test'i çalıştır**

Run: `cd packages/server && npx vitest run tests/lobby.socket.test.ts`
Expected: PASS — 3 test yeşil (full flow + 2 edge case)

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/lobby.socket.test.ts
git commit -m "test(server): add lobby socket integration tests (2-client flow)"
```

---

## Task 7: Client — Vite Setup + Network Layer

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/tsconfig.json`
- Create: `packages/client/index.html`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/src/main.ts`
- Create: `packages/client/src/network/api.ts`
- Create: `packages/client/src/network/socket.ts`
- Create: `packages/client/src/types.ts`

**Interfaces:**
- Produces: Vite dev server (port 5173), API fetch wrapper, Socket.io client singleton

- [ ] **Step 1: `packages/client/package.json`**

```json
{
  "name": "@amongus/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: `packages/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `packages/client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: `packages/client/index.html`**

```html
<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Among Us Clone</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">
      <section id="login-screen" class="screen">
        <div class="card">
          <h1>🚀 AMONG US</h1>
          <input id="login-username" type="text" placeholder="Kullanıcı adı" maxlength="20" />
          <input id="login-password" type="password" placeholder="Şifre" />
          <div class="button-row">
            <button id="btn-login">Giriş Yap</button>
            <button id="btn-register" class="secondary">Kayıt Ol</button>
          </div>
          <p id="login-error" class="error"></p>
        </div>
      </section>

      <section id="menu-screen" class="screen" hidden>
        <div class="card">
          <div class="menu-header">
            <h2>Merhaba, <span id="menu-username"></span>!</h2>
            <button id="btn-logout" class="link">Çıkış</button>
          </div>
          <div class="menu-actions">
            <div class="action-box">
              <h3>ODA OLUŞTUR</h3>
              <input id="create-password" type="password" placeholder="Şifre (opsiyonel)" />
              <button id="btn-create">Yeni Oda</button>
            </div>
            <div class="action-box">
              <h3>KOD İLE KATIL</h3>
              <input id="join-code" type="text" placeholder="A4KQ9Z" maxlength="6" />
              <input id="join-password" type="password" placeholder="Şifre (opsiyonel)" />
              <button id="btn-join">Katıl</button>
            </div>
          </div>
          <p id="menu-error" class="error"></p>
        </div>
      </section>

      <section id="lobby-screen" class="screen" hidden>
        <div class="card lobby">
          <div class="lobby-header">
            <h2>Oda: <span id="lobby-code"></span></h2>
            <button id="btn-copy-code" class="link">Kopyala</button>
          </div>
          <div id="players-list" class="players-list"></div>
          <div class="color-picker">
            <h3>Renk:</h3>
            <div id="color-buttons"></div>
          </div>
          <div class="lobby-actions">
            <button id="btn-ready">Hazır Değil</button>
            <button id="btn-leave" class="secondary">Çıkış</button>
            <button id="btn-start" class="primary" hidden>BAŞLAT</button>
          </div>
          <p id="lobby-error" class="error"></p>
        </div>
      </section>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: `packages/client/src/types.ts`**

```typescript
export interface AuthUser {
  id: string;
  username: string;
}

export interface LobbyPlayerState {
  userId: string;
  username: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  hasPassword: boolean;
  players: LobbyPlayerState[];
  status: "LOBBY" | "STARTING";
  maxPlayers: number;
}
```

- [ ] **Step 6: `packages/client/src/network/api.ts`**

```typescript
import type { AuthUser } from "../types.js";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).message || `Request failed: ${res.status}`);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
};
```

- [ ] **Step 7: `packages/client/src/network/socket.ts`**

```typescript
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ withCredentials: true });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

- [ ] **Step 8: `packages/client/src/main.ts` (placeholder, app.ts in next task)**

```typescript
// Entry point — app logic added in Task 8
console.log("amongus client starting...");
import "./app.js";
```

- [ ] **Step 9: Bağımlılıkları yükle**

Run: `cd packages/client && npm install`

- [ ] **Step 10: Commit**

```bash
git add packages/client/
git commit -m "feat(client): add Vite setup, network layer (api + socket client)"
```

---

## Task 8: Client — Screen Manager + Login/Menu/Lobby Logic

**Files:**
- Create: `packages/client/src/app.ts`
- Create: `packages/client/src/screens/login.ts`
- Create: `packages/client/src/screens/menu.ts`
- Create: `packages/client/src/screens/lobby.ts`
- Create: `packages/client/public/styles.css`

**Interfaces:**
- Produces: Full SPA — login → menu → lobby, realtime lobby updates

- [ ] **Step 1: `packages/client/src/app.ts`**

```typescript
import { api } from "./network/api.js";
import { initLoginScreen } from "./screens/login.js";
import { initMenuScreen } from "./screens/menu.js";
import { initLobbyScreen } from "./screens/lobby.js";

export type Screen = "login" | "menu" | "lobby";

export function showScreen(screen: Screen): void {
  for (const s of ["login", "menu", "lobby"]) {
    const el = document.getElementById(`${s}-screen`);
    if (el) el.hidden = s !== screen;
  }
}

async function bootstrap(): Promise<void> {
  initLoginScreen();
  initMenuScreen();
  initLobbyScreen();

  // Check if already logged in
  try {
    const { user } = await api.me();
    showScreen("menu");
    document.getElementById("menu-username")!.textContent = user.username;
  } catch {
    showScreen("login");
  }
}

bootstrap();
```

- [ ] **Step 2: `packages/client/src/screens/login.ts`**

```typescript
import { api } from "../network/api.js";
import { showScreen } from "../app.js";

export function initLoginScreen(): void {
  const usernameInput = document.getElementById("login-username") as HTMLInputElement;
  const passwordInput = document.getElementById("login-password") as HTMLInputElement;
  const errorEl = document.getElementById("login-error")!;
  const loginBtn = document.getElementById("btn-login")!;
  const registerBtn = document.getElementById("btn-register")!;

  async function handleAction(isRegister: boolean): Promise<void> {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      errorEl.textContent = "Kullanıcı adı ve şifre gerekli";
      return;
    }
    errorEl.textContent = "";
    try {
      const { user } = isRegister
        ? await api.register(username, password)
        : await api.login(username, password);
      document.getElementById("menu-username")!.textContent = user.username;
      showScreen("menu");
    } catch (err: any) {
      errorEl.textContent = err.message || "Bir hata oluştu";
    }
  }

  loginBtn.addEventListener("click", () => handleAction(false));
  registerBtn.addEventListener("click", () => handleAction(true));
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAction(false);
  });
}
```

- [ ] **Step 3: `packages/client/src/screens/menu.ts`**

```typescript
import { api } from "../network/api.js";
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";

export function initMenuScreen(): void {
  const logoutBtn = document.getElementById("btn-logout")!;
  const createBtn = document.getElementById("btn-create")!;
  const joinBtn = document.getElementById("btn-join")!;
  const errorEl = document.getElementById("menu-error")!;

  logoutBtn.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    showScreen("login");
  });

  createBtn.addEventListener("click", () => {
    const password = (document.getElementById("create-password") as HTMLInputElement).value || undefined;
    errorEl.textContent = "";
    const socket = getSocket();
    socket.emit("lobby:create", { password });
  });

  joinBtn.addEventListener("click", () => {
    const code = (document.getElementById("join-code") as HTMLInputElement).value.trim().toUpperCase();
    const password = (document.getElementById("join-password") as HTMLInputElement).value || undefined;
    if (!code) {
      errorEl.textContent = "Oda kodu gerekli";
      return;
    }
    errorEl.textContent = "";
    const socket = getSocket();
    socket.emit("lobby:join", { code, password });
  });
}
```

- [ ] **Step 4: `packages/client/src/screens/lobby.ts`**

```typescript
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { LobbyState } from "../types.js";

// Local copy of colors — avoids cross-package import complexity in the browser bundle.
// These MUST match packages/shared/src/constants.ts LOBBY_COLORS exactly.
const COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
];

const COLOR_HEX: Record<string, string> = {
  red: "#e53935", blue: "#1e88e5", green: "#43a047", pink: "#ec407a",
  orange: "#fb8c00", yellow: "#fdd835", black: "#212121", white: "#fafafa",
  purple: "#8e24aa", brown: "#795548", cyan: "#00acc1", lime: "#c0ca33",
};

let currentUserId = "";

export function initLobbyScreen(): void {
  const socket = getSocket();

  // Fetch current user id (from /api/auth/me) — set on lobby state received
  fetch("/api/auth/me", { credentials: "include" })
    .then((r) => r.json())
    .then((data) => {
      if (data.user) currentUserId = data.user.id;
    })
    .catch(() => {});

  // Build color buttons
  const colorButtonsEl = document.getElementById("color-buttons")!;
  for (const color of COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.style.backgroundColor = COLOR_HEX[color];
    btn.dataset.color = color;
    btn.addEventListener("click", () => {
      socket.emit("lobby:setColor", { color });
    });
    colorButtonsEl.appendChild(btn);
  }

  socket.on("lobby:state", (state: LobbyState) => {
    renderLobby(state);
    showScreen("lobby");
  });

  socket.on("lobby:updated", (state: LobbyState) => {
    renderLobby(state);
  });

  socket.on("lobby:error", (err: { code: string; message: string }) => {
    const errorEl = document.getElementById("lobby-error")!;
    errorEl.textContent = err.message;
    setTimeout(() => (errorEl.textContent = ""), 3000);
  });

  socket.on("lobby:started", () => {
    const errorEl = document.getElementById("lobby-error")!;
    errorEl.textContent = "🎉 Oyun başlıyor! (Sub-project 3'te gelecek)";
  });

  // Action buttons
  document.getElementById("btn-ready")!.addEventListener("click", () => {
    socket.emit("lobby:toggleReady");
  });

  document.getElementById("btn-leave")!.addEventListener("click", () => {
    socket.emit("lobby:leave");
    showScreen("menu");
  });

  document.getElementById("btn-start")!.addEventListener("click", () => {
    socket.emit("lobby:start");
  });

  document.getElementById("btn-copy-code")!.addEventListener("click", () => {
    const code = document.getElementById("lobby-code")!.textContent;
    if (code) navigator.clipboard.writeText(code);
  });
}

function renderLobby(state: LobbyState): void {
  document.getElementById("lobby-code")!.textContent = state.code;

  // Render players
  const listEl = document.getElementById("players-list")!;
  listEl.innerHTML = "";
  for (const p of state.players) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span class="player-dot" style="background:${COLOR_HEX[p.color] || "#888"}"></span>
      <span class="player-name">${p.username}${p.isHost ? " 👑" : ""}</span>
      <span class="player-ready">${p.isReady ? "✓ Hazır" : "⏳ Bekliyor"}</span>
    `;
    listEl.appendChild(row);
  }

  // Update ready button text
  const me = state.players.find((p) => p.userId === currentUserId);
  const readyBtn = document.getElementById("btn-ready")!;
  if (me) {
    readyBtn.textContent = me.isReady ? "Hazır Olmadan" : "Hazır Ol";
  }

  // Show start button only for host
  const startBtn = document.getElementById("btn-start")!;
  startBtn.hidden = !(me?.isHost);

  // Highlight selected color
  const buttons = document.querySelectorAll(".color-btn");
  buttons.forEach((b) => {
    const el = b as HTMLButtonElement;
    el.classList.toggle("selected", el.dataset.color === me?.color);
    el.disabled = state.players.some((p) => p.color === el.dataset.color && p.userId !== currentUserId);
  });
}
```

- [ ] **Step 5: `packages/client/public/styles.css`**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Segoe UI", system-ui, sans-serif;
  background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 100%);
  color: #e0e1dd;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.screen {
  width: 100%;
  max-width: 480px;
  padding: 20px;
}

.card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  backdrop-filter: blur(10px);
}

h1 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 24px;
  letter-spacing: 2px;
  color: #ffd166;
}

h2 {
  font-size: 1.4rem;
  margin-bottom: 16px;
}

h3 {
  font-size: 1rem;
  margin-bottom: 8px;
  color: #a0a0a0;
}

input {
  width: 100%;
  padding: 12px;
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: #ffd166;
}

button {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: #ffd166;
  color: #1b263b;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}

button:hover {
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

button.secondary {
  background: rgba(255, 255, 255, 0.15);
  color: #e0e1dd;
}

button.primary {
  background: #06d6a0;
  color: #1b263b;
}

button.link {
  width: auto;
  background: transparent;
  color: #a0a0a0;
  padding: 4px 8px;
}

.button-row {
  display: flex;
  gap: 8px;
}

.button-row button {
  flex: 1;
}

.error {
  color: #ef476f;
  font-size: 0.9rem;
  min-height: 1.2em;
  margin-top: 8px;
}

.menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.menu-actions {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.action-box {
  background: rgba(0, 0, 0, 0.2);
  padding: 16px;
  border-radius: 12px;
}

.action-box button {
  margin-top: 8px;
}

/* Lobby */
.lobby-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lobby-header h2 {
  margin: 0;
}

#lobby-code {
  color: #ffd166;
  font-family: monospace;
  font-size: 1.6rem;
  letter-spacing: 4px;
}

.players-list {
  margin: 20px 0;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.player-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.player-name {
  flex: 1;
  font-weight: 500;
}

.player-ready {
  font-size: 0.85rem;
  color: #a0a0a0;
}

.color-picker {
  margin: 16px 0;
}

#color-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid transparent;
  padding: 0;
}

.color-btn.selected {
  border-color: #ffd166;
  transform: scale(1.15);
}

.lobby-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lobby-actions button {
  flex: 1;
  min-width: 100px;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/
git commit -m "feat(client): add login, menu, lobby screens with realtime socket sync"
```

---

## Task 9: Server — Static Serve + Dockerfile Update

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/Dockerfile`

- [ ] **Step 1: `app.ts`'ye production static serve ekle**

`packages/server/src/app.ts` dosyasına şu import'u ekle (en üste, diğer import'ların altına):

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
```

Ve `createApp()` fonksiyonunda, `app.use(errorHandler)`'dan ÖNCE şu bloğu ekle:

```typescript
  // Serve client in production
  if (env.isProd) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, "../../client/dist");
    app.use(express.static(clientDist));
    // SPA fallback: non-API routes return index.html
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
        res.sendFile(path.join(clientDist, "index.html"));
      }
    });
  }
```

- [ ] **Step 2: Dockerfile'a client build stage ekle**

`packages/server/Dockerfile` dosyasında, builder stage'den SONRA (ve runner stage'den ÖNCE) yeni bir client-builder stage ekle:

```dockerfile
# --- Client build stage ---
FROM node:24-alpine AS client-builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/client/package.json ./packages/client/
COPY packages/shared/package.json ./packages/shared/
RUN npm install
COPY packages/client ./packages/client
COPY packages/shared ./packages/shared
RUN npm run build --workspace @amongus/client
```

Ve runner stage'inde, mevcut COPY komutlarının sonuna şunu ekle:

```dockerfile
COPY --from=client-builder /app/packages/client/dist ./packages/client/dist
```

- [ ] **Step 3: tsc + tests doğrula**

Run: `cd packages/server && npx tsc --noEmit`
Expected: hata yok

Run: `cd packages/server && npx vitest run tests/auth.password.test.ts tests/auth.jwt.test.ts tests/lobby.codes.test.ts tests/lobby.manager.test.ts`
Expected: tüm testler yeşil

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/app.ts packages/server/Dockerfile
git commit -m "feat: serve client in production + Dockerfile client build stage"
```

---

## Task 10: Manual E2E Test + Docs + Tag

**Files:**
- Modify: `README.md`
- Create: `packages/client/README.md`

- [ ] **Step 1: Manual E2E test**

İki terminal aç:

Terminal 1 (server):
```bash
cd packages/server
npm run dev
```

Terminal 2 (client):
```bash
cd packages/client
npm run dev
```

Tarayıcıda `http://localhost:5173` aç:
1. Kayıt ol / giriş yap
2. "Yeni Oda" butonuna bas → oda kodu görünmeli
3. İkinci tarayıcı (gizli pencere) aç, farklı kullanıcı ile giriş yap
4. Aynı kod ile katıl → her iki tarafta da 2 oyuncu görünmeli
5. Renk değiştir → diğer taraf görmeli
6. Hazır ol → diğer taraf görmeli
7. Host çıkınca → diğerinin host olması

- [ ] **Step 2: `packages/client/README.md`**

```markdown
# @amongus/client

Among Us klonu frontend — Vite + Socket.io-client.

## Geliştirme

```bash
cd packages/client
npm install
npm run dev
# http://localhost:5173 (API'yi :3000'ye proxy eder)
```

Server'ın da çalışması gerekir: `cd packages/server && npm run dev`

## Build

```bash
npm run build
# dist/ klasörü oluşur, server bunu production'da serve eder
```
```

- [ ] **Step 3: Kök `README.md`'yi güncelle — status bölümü**

`## Status` bölümünü şununla değiştir:

```markdown
## Status

✅ **Sub-project 1:** Temel Kurulum + Auth
✅ **Sub-project 2:** Lobi Sistemi (Socket.io ile oda yönetimi)
- Oda oluşturma, kod ile katılma
- Renk seçimi, hazır durumu
- Host yönetimi (otomatik transfer)
- Login + Menu + Lobby ekranları
- Realtime senkronizasyon

🚧 **Sonraki:** Sub-project 3 — Oyun Çekirdeği (hareket, harita, roller)
```

- [ ] **Step 4: Tüm testleri çalıştır**

```bash
cd packages/shared && npx vitest run
cd ../server && npx vitest run
```

Expected: tüm testler yeşil

- [ ] **Step 5: Commit + tag**

```bash
git add -A
git commit -m "docs: complete Sub-project 2 documentation"
git tag sub-project-2-complete
```

---

## Sub-project 2 Tamamlama Kriterleri

- [ ] Shared: lobby tipleri, constants, validation (12 test)
- [ ] Server: lobby code generator (3 test)
- [ ] Server: LobbyManager class (~20 test)
- [ ] Server: Socket.io + auth middleware (3 test)
- [ ] Server: Lobby socket integration (3 test)
- [ ] Client: Vite + network layer
- [ ] Client: Login + Menu + Lobby screens
- [ ] Server: production static serve
- [ ] Dockerfile: client build stage
- [ ] Manual E2E test başarılı
- [ ] Tag `sub-project-2-complete`
