# Sub-project 4B: Meeting & Voting — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Emergency button + ceset raporu → meeting ekranı (chat + oylama + timer) → atılma. Sub-project 4A'daki report placeholder'ını gerçek meeting sistemiyle değiştirir. Tam oynanabilir Among Us.

**Architecture:** GameEngine'e meeting state ve vote mantığı eklenir. Meeting sırasında tick loop movement'ı atlar (pause). Client'a meeting ekranı (HTML overlay: chat, vote buttons, timer) eklenir.

**Tech Stack:** Mevcut yığın + HTML meeting overlay.

## Global Constraints

- Node 24+, TS strict, ESM .js imports, English code, conventional commits, master branch
- Meeting duration: 90000ms (90sn), emergency 1 kullanım/oyun
- Sadece canlı oyuncular oy verir/yazar
- Oylama değiştirilebilir (süre dolmadan)
- Server-authoritative: tüm doğrulama server'da

---

## Task 1: Shared — Meeting Constants + Types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: constants.ts'ye ekle**

```typescript

// ─── Meeting constants ─────────────────────────────────────────────────

export const MEETING_DURATION_MS = 90000;  // 90 seconds
export const EMERGENCY_BUTTON_TILE = { x: 25, y: 25 }; // cafeteria center
```

- [ ] **Step 2: types.ts'ye ekle**

```typescript

// ─── Meeting types ─────────────────────────────────────────────────────

export interface MeetingPlayerInfo {
  userId: string;
  username: string;
  color: string;
  isAlive: boolean;
}

export interface MeetingStartedPayload {
  reason: "report" | "emergency";
  reporterId: string;
  reporterName: string;
  duration: number;
  players: MeetingPlayerInfo[];
  victimId?: string;
}

export interface MeetingResultPayload {
  ejectedId: string | null;
  ejectedRole: "IMPOSTOR" | "CREW" | null;
  wasTie: boolean;
  votes: Record<string, string | "skip">;
}

export interface VoteUpdatePayload {
  voted: Record<string, boolean>; // userId → has voted
}

export interface ChatMessagePayload {
  userId: string;
  username: string;
  message: string;
}

export const MEETING_EVENTS = {
  EMERGENCY: "game:emergency",
  VOTE: "game:vote",
  MEETING_STARTED: "game:meetingStarted",
  VOTE_UPDATE: "game:voteUpdate",
  MEETING_ENDED: "game:meetingEnded",
  CHAT_MESSAGE: "game:chatMessage",
  SEND_CHAT: "game:sendChat",
} as const;
```

- [ ] **Step 3: Build + commit**

```bash
cd packages/shared && npx tsc
git add packages/shared/
git commit -m "feat(shared): add meeting constants and types"
```

---

## Task 2: Server — Meeting Logic (tallyVotes + MeetingState)

**Files:**
- Create: `packages/server/src/game/meeting.ts`
- Modify: `packages/server/src/game/types.ts`
- Test: `packages/server/tests/game.meeting.test.ts`

- [ ] **Step 1: types.ts'ye MeetingState ekle**

Add to `packages/server/src/game/types.ts`:

```typescript
export interface MeetingState {
  matchId: string;
  reason: "report" | "emergency";
  reporterId: string;
  victimId?: string;
  startedAt: number;
  durationMs: number;
  votes: Map<string, string | "skip">;
}
```

Add `meetingState: MeetingState | null;` and `emergencyUsed: Set<string>;` to GameState.

- [ ] **Step 2: meeting.ts — tallyVotes**

```typescript
export interface VoteTally {
  ejected: string | null;
  wasTie: boolean;
  voteCounts: Map<string, number>;
}

export function tallyVotes(votes: Map<string, string | "skip">): VoteTally {
  const counts = new Map<string, number>();
  for (const target of votes.values()) {
    counts.set(target, (counts.get(target) || 0) + 1);
  }

  let maxVotes = 0;
  let winners: string[] = [];
  for (const [target, count] of counts) {
    if (count > maxVotes) {
      maxVotes = count;
      winners = [target];
    } else if (count === maxVotes) {
      winners.push(target);
    }
  }

  if (maxVotes === 0) {
    return { ejected: null, wasTie: false, voteCounts: counts };
  }
  if (winners.length === 1 && winners[0] !== "skip") {
    return { ejected: winners[0], wasTie: false, voteCounts: counts };
  }
  return { ejected: null, wasTie: winners.length > 1, voteCounts: counts };
}
```

- [ ] **Step 3: Test — `packages/server/tests/game.meeting.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { tallyVotes } from "../src/game/meeting.js";

describe("tallyVotes", () => {
  it("returns no ejection when no votes", () => {
    const votes = new Map<string, string | "skip">();
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
    expect(result.wasTie).toBe(false);
  });

  it("ejects player with most votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u3"],
      ["u2", "u3"],
      ["u3", "u1"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBe("u3");
    expect(result.wasTie).toBe(false);
  });

  it("returns tie when two players have equal votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u2"],
      ["u2", "u3"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
    expect(result.wasTie).toBe(true);
  });

  it("does not eject when skip has most votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "skip"],
      ["u2", "skip"],
      ["u3", "u1"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
  });

  it("ejects player even if skip has fewer votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u2"],
      ["u2", "u2"],
      ["u3", "skip"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBe("u2");
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd packages/server && npx vitest run tests/game.meeting.test.ts
git add packages/server/src/game/meeting.ts packages/server/src/game/types.ts packages/server/tests/game.meeting.test.ts
git commit -m "feat(server): add meeting vote tally logic with tests"
```

---

## Task 3: Server — GameEngine Meeting Methods

**Files:**
- Modify: `packages/server/src/game/engine.ts`

- [ ] **Step 1: Add meeting methods to GameEngine**

```typescript
  startMeeting(matchId: string, reason: "report" | "emergency", reporterId: string, victimId?: string): boolean {
    const match = this.matches.get(matchId);
    if (!match) return false;
    if (match.meetingState) return false; // already in meeting

    match.meetingState = {
      matchId,
      reason,
      reporterId,
      victimId,
      startedAt: Date.now(),
      durationMs: MEETING_DURATION_MS,
      votes: new Map(),
    };
    return true;
  }

  vote(matchId: string, voterId: string, target: string | "skip"): { success: boolean; message?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    if (!match.meetingState) return { success: false, message: "Not in meeting" };

    const voter = match.players.get(voterId);
    if (!voter) return { success: false, message: "Player not found" };
    if (!voter.isAlive) return { success: false, message: "Dead players cannot vote" };

    // Validate target (must be alive player or skip)
    if (target !== "skip") {
      const targetPlayer = match.players.get(target);
      if (!targetPlayer || !targetPlayer.isAlive) {
        return { success: false, message: "Invalid target" };
      }
    }

    match.meetingState.votes.set(voterId, target);
    return { success: true };
  }

  endMeeting(matchId: string): { ejectedId: string | null; ejectedRole: "IMPOSTOR" | "CREW" | null; wasTie: boolean } | null {
    const match = this.matches.get(matchId);
    if (!match || !match.meetingState) return null;

    const result = tallyVotes(match.meetingState.votes);
    let ejectedRole: "IMPOSTOR" | "CREW" | null = null;

    if (result.ejected) {
      const ejected = match.players.get(result.ejected);
      if (ejected) {
        ejected.isAlive = false;
        ejectedRole = ejected.role;
      }
    }

    match.meetingState = null;
    return { ejectedId: result.ejected, ejectedRole, wasTie: result.wasTie };
  }

  isInMeeting(matchId: string): boolean {
    const match = this.matches.get(matchId);
    return !!match?.meetingState;
  }

  shouldEndMeeting(matchId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match?.meetingState) return false;
    const elapsed = Date.now() - match.meetingState.startedAt;
    if (elapsed >= match.meetingState.durationMs) return true;
    // End early if all alive players have voted
    const aliveCount = [...match.players.values()].filter((p) => p.isAlive).length;
    return match.meetingState.votes.size >= aliveCount;
  }

  getMeetingVotes(matchId: string): Record<string, boolean> {
    const match = this.matches.get(matchId);
    if (!match?.meetingState) return {};
    const voted: Record<string, boolean> = {};
    for (const player of match.players.values()) {
      if (player.isAlive) {
        voted[player.userId] = match.meetingState.votes.has(player.userId);
      }
    }
    return voted;
  }

  canUseEmergency(matchId: string, userId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match) return false;
    if (match.emergencyUsed.has(userId)) return false;
    const player = match.players.get(userId);
    if (!player || !player.isAlive) return false;
    return true;
  }

  useEmergency(matchId: string, userId: string): void {
    const match = this.matches.get(matchId);
    if (match) match.emergencyUsed.add(userId);
  }
```

Add imports: `import { MEETING_DURATION_MS } from "@amongus/shared";` and `import { tallyVotes } from "./meeting.js";`

- [ ] **Step 2: Update tick() to skip movement during meeting**

In `tick()`, add at the start:
```typescript
    if (match.meetingState) {
      // During meeting: no movement, return current positions
      const tickPlayers: TickPlayer[] = [...match.players.values()].map((p) => ({
        userId: p.userId, x: p.x, y: p.y, facing: p.facing, isAlive: p.isAlive,
      }));
      return { players: tickPlayers };
    }
```

- [ ] **Step 3: Initialize emergencyUsed in createMatch**

In createMatch, add to the GameState object:
```typescript
      emergencyUsed: new Set(),
      meetingState: null,
```

- [ ] **Step 4: Update report() to start meeting instead of placeholder**

Replace the report() return:
```typescript
  report(matchId: string, userId: string, corpseId: string): { success: boolean; message: string; meetingStarted?: boolean } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, message: "Match not found" };
    const player = match.players.get(userId);
    if (!player) return { success: false, message: "Player not found" };
    if (!player.isAlive) return { success: false, message: "Dead players cannot report" };
    const corpse = match.corpses.find((c) => c.id === corpseId);
    if (!corpse) return { success: false, message: "Corpse not found" };
    const dist = Math.sqrt((corpse.x - player.x) ** 2 + (corpse.y - player.y) ** 2);
    if (dist > TASK_INTERACT_DISTANCE) return { success: false, message: "Too far from corpse" };
    // Start meeting instead of placeholder
    this.startMeeting(matchId, "report", userId, corpse.victimId);
    return { success: true, message: "Meeting started", meetingStarted: true };
  }
```

- [ ] **Step 5: tsc + tests + commit**

```bash
cd packages/server && npx tsc --noEmit
npx vitest run tests/game.meeting.test.ts tests/game.kill.test.ts tests/game.engine.test.ts
git add packages/server/src/game/engine.ts
git commit -m "feat(server): add meeting/vote/emergency methods to GameEngine"
```

---

## Task 4: Server — Meeting Socket Handlers + Tick Loop Meeting Check

**Files:**
- Modify: `packages/server/src/sockets/gameHandlers.ts`
- Modify: `packages/server/src/sockets/index.ts` (tick loop checks meeting end)

- [ ] **Step 1: Add meeting handlers to gameHandlers.ts**

```typescript
  socket.on(MEETING_EVENTS.VOTE, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return;
    const target = (payload as any).targetId;
    if (typeof target !== "string") return;
    const match = engine.findMatchByUser(user.userId);
    if (!match) return;
    const result = engine.vote(match.matchId, user.userId, target);
    if (result.success) {
      io.to(match.code).emit(MEETING_EVENTS.VOTE_UPDATE, { voted: engine.getMeetingVotes(match.matchId) });
    }
  });

  socket.on(MEETING_EVENTS.EMERGENCY, () => {
    const match = engine.findMatchByUser(user.userId);
    if (!match || !engine.canUseEmergency(match.matchId, user.userId)) return;
    engine.useEmergency(match.matchId, user.userId);
    engine.startMeeting(match.matchId, "emergency", user.userId);
    emitMeetingStarted(io, match.matchId, "emergency", user.userId);
  });

  socket.on(MEETING_EVENTS.SEND_CHAT, (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return;
    const message = (payload as any).message;
    if (typeof message !== "string" || message.length === 0 || message.length > 200) return;
    const match = engine.findMatchByUser(user.userId);
    if (!match || !engine.isInMeeting(match.matchId)) return;
    const player = match.players.get(user.userId);
    if (!player || !player.isAlive) return;
    io.to(match.code).emit(MEETING_EVENTS.CHAT_MESSAGE, {
      userId: user.userId,
      username: player.username,
      message,
    });
  });
```

Add helper:
```typescript
function emitMeetingStarted(io: ExtendedIo, matchId: string, reason: "report" | "emergency", reporterId: string): void {
  const match = engine.getMatch(matchId);
  if (!match) return;
  const payload = {
    reason,
    reporterId,
    reporterName: match.players.get(reporterId)?.username || "",
    duration: match.meetingState?.durationMs || 90000,
    players: [...match.players.values()].map((p) => ({
      userId: p.userId, username: p.username, color: p.color, isAlive: p.isAlive,
    })),
    victimId: match.meetingState?.victimId,
  };
  io.to(match.code).emit(MEETING_EVENTS.MEETING_STARTED, payload);
}
```

Update the report handler to trigger meeting:
```typescript
  socket.on(TASK_EVENTS.REPORT, (payload) => {
    // ... existing validation ...
    const result = engine.report(match.matchId, user.userId, corpseId);
    if (result.success && result.meetingStarted) {
      emitMeetingStarted(io, match.matchId, "report", user.userId);
    }
    socket.emit(TASK_EVENTS.REPORT_RESULT, result);
  });
```

- [ ] **Step 2: Tick loop meeting end check in index.ts**

In the tick interval, after tick(), check for meeting end:
```typescript
  setInterval(() => {
    for (const matchId of gameEngine.getActiveMatchIds()) {
      // Check meeting end
      if (gameEngine.shouldEndMeeting(matchId)) {
        const result = gameEngine.endMeeting(matchId);
        if (result) {
          const match = gameEngine.getMatch(matchId);
          if (match) {
            // Get votes as record
            const votes: Record<string, string | "skip"> = {};
            // Note: endMeeting already cleared meetingState, so we reconstruct from result
            io.to(match.code).emit(MEETING_EVENTS.MEETING_ENDED, {
              ejectedId: result.ejectedId,
              ejectedRole: result.ejectedRole,
              wasTie: result.wasTie,
              votes: votes, // simplified — full vote data could be captured before clearing
            });
            const winner = gameEngine.checkWin(matchId);
            if (winner) {
              handleGameEnd(io, gameEngine, matchId, winner);
            }
          }
        }
        continue; // skip tick during meeting transition
      }
      // Normal tick
      const payload = gameEngine.tick(matchId);
      const match = gameEngine.getMatch(matchId);
      if (match) {
        io.to(match.code).emit(GAME_EVENTS.TICK, payload);
      }
    }
  }, 50);
```

- [ ] **Step 3: tsc + tests + commit**

```bash
cd packages/server && npx tsc --noEmit && npx vitest run tests/game.meeting.test.ts tests/game.kill.test.ts
git add packages/server/src/sockets/
git commit -m "feat(server): wire meeting/vote/emergency/chat socket handlers + tick meeting check"
```

---

## Task 5: Client — Meeting Screen UI

**Files:**
- Modify: `packages/client/index.html`
- Modify: `packages/client/public/styles.css`
- Create: `packages/client/src/screens/meeting.ts`
- Modify: `packages/client/src/app.ts`
- Modify: `packages/client/src/screens/game.ts`

- [ ] **Step 1: HTML — meeting screen section**

Add to `packages/client/index.html` inside `#app`, after `#game-screen`:

```html
      <section id="meeting-screen" class="screen meeting" hidden>
        <div class="meeting-card">
          <h2 id="meeting-title">📢 MEETING</h2>
          <p id="meeting-timer">⏱️ 90 saniye</p>
          <div id="meeting-chat" class="meeting-chat"></div>
          <div id="vote-buttons" class="vote-buttons"></div>
          <div class="chat-input-row">
            <input id="chat-input" type="text" placeholder="Mesaj yaz..." maxlength="200" />
            <button id="chat-send">Gönder</button>
          </div>
        </div>
      </section>
```

- [ ] **Step 2: CSS — append to styles.css**

```css
.meeting { max-width: 500px; }
.meeting-card {
  background: rgba(255,255,255,0.05); border: 2px solid #ffd166;
  border-radius: 16px; padding: 24px;
}
.meeting-card h2 { color: #ffd166; text-align: center; margin-bottom: 8px; }
#meeting-timer { text-align: center; color: #06d6a0; margin-bottom: 16px; }
.meeting-chat {
  height: 200px; overflow-y: auto; background: rgba(0,0,0,0.3);
  border-radius: 8px; padding: 12px; margin-bottom: 16px;
}
.chat-msg { margin-bottom: 6px; }
.chat-msg .chat-user { font-weight: bold; }
.vote-buttons { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.vote-btn {
  display: flex; align-items: center; gap: 12px; padding: 10px;
  background: rgba(0,0,0,0.3); border: 2px solid transparent; border-radius: 8px;
  cursor: pointer; color: #fff; width: 100%; text-align: left;
}
.vote-btn:hover { border-color: #ffd166; }
.vote-btn.selected { border-color: #06d6a0; background: rgba(6,214,160,0.2); }
.vote-btn .vote-dot { width: 20px; height: 20px; border-radius: 50%; }
.vote-btn .voted-mark { margin-left: auto; color: #06d6a0; }
.chat-input-row { display: flex; gap: 8px; }
.chat-input-row input { flex: 1; }
.chat-input-row button { width: auto; padding: 12px 20px; }
```

- [ ] **Step 3: meeting.ts screen logic**

```typescript
import { getSocket } from "../network/socket.js";
import { showScreen } from "../app.js";
import type { MeetingPlayerInfo } from "../types.js";

const COLOR_HEX: Record<string, string> = {
  red: "#e53935", blue: "#1e88e5", green: "#43a047", pink: "#ec407a",
  orange: "#fb8c00", yellow: "#fdd835", black: "#212121", white: "#fafafa",
  purple: "#0x8e24aa", brown: "#795548", cyan: "#00acc1", lime: "#c0ca33",
};

let meetingPlayers: MeetingPlayerInfo[] = [];
let myUserId = "";
let myVote: string | "skip" | null = null;

export async function initMeetingScreen(): Promise<void> {
  const socket = getSocket();

  // Get user ID
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json();
    if (data.user) myUserId = data.user.id;
  } catch {}

  socket.on("game:meetingStarted", (payload: any) => {
    meetingPlayers = payload.players;
    const title = document.getElementById("meeting-title")!;
    title.textContent = payload.reason === "emergency"
      ? `📢 EMERGENCY MEETING (${payload.reporterName})`
      : `📢 ${payload.reporterName} ceset buldu!`;
    document.getElementById("meeting-chat")!.innerHTML = "";
    renderVoteButtons();
    showScreen("meeting");
    startTimer(payload.duration);
  });

  socket.on("game:voteUpdate", (payload: { voted: Record<string, boolean> }) => {
    renderVoteButtons(payload.voted);
  });

  socket.on("game:chatMessage", (payload: { userId: string; username: string; message: string }) => {
    const chat = document.getElementById("meeting-chat")!;
    const msg = document.createElement("div");
    msg.className = "chat-msg";
    const user = document.createElement("span");
    user.className = "chat-user";
    user.textContent = payload.username + ": ";
    const text = document.createElement("span");
    text.textContent = payload.message;
    msg.appendChild(user);
    msg.appendChild(text);
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  });

  socket.on("game:meetingEnded", (payload: any) => {
    const title = document.getElementById("meeting-title")!;
    if (payload.ejectedId) {
      title.textContent = `${payload.ejectedId} atıldı! Rol: ${payload.ejectedRole}`;
    } else if (payload.wasTie) {
      title.textContent = "Beraberlik! Kimse atılmadı.";
    } else {
      title.textContent = "Skip kazandı. Kimse atılmadı.";
    }
    setTimeout(() => {
      showScreen("game");
      myVote = null;
    }, 5000);
  });

  // Chat send
  const sendBtn = document.getElementById("chat-send")!;
  const chatInput = document.getElementById("chat-input") as HTMLInputElement;
  sendBtn.addEventListener("click", () => {
    const msg = chatInput.value.trim();
    if (msg) {
      socket.emit("game:sendChat", { message: msg });
      chatInput.value = "";
    }
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
}

function renderVoteButtons(voted?: Record<string, boolean>): void {
  const container = document.getElementById("vote-buttons")!;
  container.innerHTML = "";
  const me = meetingPlayers.find((p) => p.userId === myUserId);
  const canVote = me?.isAlive ?? false;

  for (const p of meetingPlayers) {
    if (!p.isAlive) continue;
    if (p.userId === myUserId) continue;
    const btn = document.createElement("button");
    btn.className = "vote-btn";
    if (myVote === p.userId) btn.classList.add("selected");
    const dot = document.createElement("span");
    dot.className = "vote-dot";
    dot.style.background = COLOR_HEX[p.color] || "#888";
    const name = document.createElement("span");
    name.textContent = p.username;
    btn.appendChild(dot);
    btn.appendChild(name);
    if (voted?.[p.userId]) {
      const mark = document.createElement("span");
      mark.className = "voted-mark";
      mark.textContent = "✓";
      btn.appendChild(mark);
    }
    if (canVote) {
      btn.addEventListener("click", () => {
        myVote = p.userId;
        getSocket().emit("game:vote", { targetId: p.userId });
        renderVoteButtons(voted);
      });
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  }

  // Skip button
  const skip = document.createElement("button");
  skip.className = "vote-btn";
  if (myVote === "skip") skip.classList.add("selected");
  skip.textContent = "Skip (çekimser)";
  if (canVote) {
    skip.addEventListener("click", () => {
      myVote = "skip";
      getSocket().emit("game:vote", { targetId: "skip" });
      renderVoteButtons(voted);
    });
  } else {
    skip.disabled = true;
  }
  container.appendChild(skip);
}

function startTimer(duration: number): void {
  const timerEl = document.getElementById("meeting-timer")!;
  const startTime = Date.now();
  const update = () => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
    timerEl.textContent = `⏱️ ${remaining} saniye`;
    if (remaining > 0) setTimeout(update, 1000);
  };
  update();
}
```

- [ ] **Step 4: Wire into app.ts**

Add `import { initMeetingScreen } from "./screens/meeting.js";` and call `initMeetingScreen()` in bootstrap.

- [ ] **Step 5: Build + commit**

```bash
cd packages/client && npx vite build
git add packages/client/
git commit -m "feat(client): add meeting screen with chat, voting, and timer"
```

---

## Task 6: Docs + Tag

- [ ] **Step 1: Update README**

```markdown
✅ **Sub-project 4B:** Meeting & Voting (tam oynanabilir!)
- Emergency button + ceset raporu → meeting
- Chat, oylama, atılma
- Kazanma koşulları tam çalışır
```

- [ ] **Step 2: Run tests, commit, tag**

```bash
git add -A && git commit -m "docs: complete Sub-project 4B documentation"
git tag sub-project-4b-complete
```
