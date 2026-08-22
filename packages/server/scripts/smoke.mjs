// End-to-end smoke test against a running dev server (localhost:3000).
// Run with: npx tsx scripts/smoke.mjs   (tsx needed to import WALL_GRID)
//
// Full gameplay loop through real HTTP auth + real sockets:
// register x4 -> lobby -> ready -> start -> roles/tasks -> BFS-walk to task ->
// complete task -> impostor kill (after cooldown) -> corpse report -> meeting ->
// all vote skip -> meeting ends -> vitals monitor shows 1 dead -> stats API.
import { io } from "socket.io-client";
import { WALL_GRID } from "../src/game/mapData.js";

const API = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function register(name) {
  let res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: name, password: "secret123" }),
  });
  if (res.status === 409) {
    res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: "secret123" }),
    });
  }
  if (!res.ok) throw new Error(`auth ${name}: ${res.status}`);
  const body = await res.json();
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { name, userId: body.user.id, cookie };
}

function connect(u) {
  const c = io(API, { extraHeaders: { Cookie: u.cookie }, transports: ["websocket"] });
  c.on("connect_error", (e) => console.log(`   connect_error (${u.name}): ${e.message}`));
  return c;
}

function waitEvent(client, event, predicate, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeout);
    const handler = (data) => {
      if (!predicate || predicate(data)) {
        clearTimeout(timer);
        client.off(event, handler);
        resolve(data);
      }
    };
    client.on(event, handler);
  });
}

// ---- BFS pathfinding over WALL_GRID (true = wall) ----
function nearestWalkable(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (!WALL_GRID[y]?.[x]) return [x, y];
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!WALL_GRID[ny]?.[nx]) return [nx, ny];
      }
    }
  }
  return null;
}

function bfs(sx, sy, tx, ty) {
  const start = nearestWalkable(sx, sy);
  const target = nearestWalkable(tx, ty);
  if (!start || !target) return null;
  [sx, sy] = start;
  [tx, ty] = target;
  const key = (x, y) => y * 50 + x;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      const path = [];
      let k = key(x, y);
      while (k !== null) {
        path.unshift({ x: k % 50, y: Math.floor(k / 50) });
        k = prev.get(k);
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= 50 || nx < 0 || nx >= 50) continue;
      if (WALL_GRID[ny][nx]) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, key(x, y));
      q.push([nx, ny]);
    }
  }
  return null;
}

/** Walk a client (tracked by userId in ticks) to a target tile. */
function walkTo(client, userId, getPos, tx, ty, label) {
  return new Promise((resolve, reject) => {
    let path = null;
    let wp = 0;
    let seq = 0;
    let lastPos = null;
    let stuckMs = 0;
    const timer = setTimeout(() => {
      client.emit("game:input", { dx: 0, dy: 0, seq: seq++ });
      reject(new Error(`walk timeout: ${label} (stuck=${stuckMs}ms)`));
    }, 60000);
    const iv = setInterval(() => {
      const pos = getPos();
      if (!pos) return;
      if (process.env.SMOKE_DEBUG && Math.random() < 0.15) console.log(`   [dbg] ${label} @ (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) wp=${wp}/${path?.length ?? "?"}`);
      if (!path) {
        path = bfs(pos.x, pos.y, tx, ty);
        if (!path) {
          clearInterval(iv); clearTimeout(timer);
          reject(new Error(`no path to ${label}`));
          return;
        }
        wp = 1;
      }
      // path may be stale if we were pushed; replan when far off-path
      const target = path[Math.min(wp, path.length - 1)];
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      const distFinal = Math.hypot(tx - pos.x, ty - pos.y);
      if (distFinal <= 1.3) {
        clearInterval(iv); clearTimeout(timer);
        client.emit("game:input", { dx: 0, dy: 0, seq: seq++ });
        resolve(distFinal);
        return;
      }
      if (dist < 0.6 && wp < path.length - 1) {
        wp++;
        return;
      }
      // stuck detection
      if (lastPos && Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < 0.05) {
        stuckMs += 60;
        if (stuckMs > 4000) {
          console.log(`   [dbg] STUCK ${label} @ (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) hedef: (${tx},${ty}) — replan`);
          path = null; stuckMs = 0;
          return;
        }
      } else stuckMs = 0;
      lastPos = { ...pos };
      const dx = target.x - pos.x, dy = target.y - pos.y;
      const len = Math.hypot(dx, dy) || 1;
      client.emit("game:input", { dx: dx / len, dy: dy / len, seq: seq++ });
    }, 60);
  });
}

const suffix = String(Date.now() % 100000);
const users = [];
for (const n of ["a", "b", "c", "d"]) users.push(await register(`smoke${suffix}${n}`));
check("4 kullanıcı kaydı (HTTP + cookie)", users.every((u) => u.cookie.includes("=")));

const clients = users.map(connect);
const pos = new Map(); // userId -> {x,y}
clients.forEach((c) =>
  c.on("game:tick", (t) => {
    for (const p of t.players ?? []) pos.set(p.userId, { x: p.x, y: p.y });
  })
);
await Promise.all(clients.map((c) => waitEvent(c, "connect", null, 10000)));
check("4 socket bağlantısı (JWT cookie auth)", true);

// Lobby
const [host, ...guests] = clients;
host.emit("lobby:create", {});
const state = await waitEvent(host, "lobby:state", (d) => d?.code?.length === 6);
await Promise.all(
  guests.map((g, i) => {
    g.emit("lobby:join", { code: state.code });
    return waitEvent(g, "lobby:state", (d) => d?.players?.length === i + 2, 10000);
  })
);
check("Lobby: oluştur + 3 katılım", true, `code=${state.code}`);

const allReady = waitEvent(host, "lobby:updated", (d) => d.players?.length === 4 && d.players.every((p) => p.isReady), 15000);
clients.forEach((c) => c.emit("lobby:toggleReady", {}));
await allReady;
check("4/4 hazır", true);

const gameStartAt = Date.now();
// Attach ALL post-start waiters BEFORE triggering lobby:start — the server
// emits game:started and game:tasksAssigned back-to-back; attaching after the
// first await would miss the second event (listener race).
const startedPromises = clients.map((c) => waitEvent(c, "game:started", null, 20000));
const tasksPromises = clients.map((c) => waitEvent(c, "game:tasksAssigned", null, 20000).catch(() => null));
host.emit("lobby:start", {});
const started = await Promise.all(startedPromises);
check("Oyun başladı (game:started x4)", true);
check("Roller atandı (1 impostor + 3 crew)", started.filter((s) => s.role === "IMPOSTOR").length === 1 && started.filter((s) => s.role === "CREW").length === 3);

const tasksAssigned = await Promise.all(tasksPromises);
const crewIdx = users.map((u, i) => ({ u, c: clients[i], t: tasksAssigned[i] })).filter((x) => x.t?.tasks?.length > 0);
check("Crew görevleri atandı", crewIdx.length === 3, `${crewIdx.length}/3 crew, ${crewIdx[0].t.total} görev/kişi`);

// Task completion
const walker = crewIdx[0];
const task = walker.t.tasks[0];
await waitEvent(walker.c, "game:tick", () => pos.has(walker.u.userId), 10000).catch(() => {});
console.log(`   → crew ${walker.u.name}: ${task.type} görevi @ (${task.x}, ${task.y})`);
const dist1 = await walkTo(walker.c, walker.u.userId, () => pos.get(walker.u.userId), task.x, task.y, `${task.type} görevi`);
check(`Göreve yüründü (${dist1.toFixed(2)} < 1.5)`, dist1 <= 1.5);

const updP = waitEvent(walker.c, "game:taskUpdate", (d) => d.completed >= 1, 10000);
walker.c.emit("game:taskComplete", { taskId: task.id });
const upd = await updP;
check("Görev tamamlandı + yayın (game:taskUpdate)", upd.completed >= 1, `${upd.completed}/${upd.total}`);

// Kill: impostor walks to a living crew victim after cooldown
const impIdx = started.findIndex((s) => s.role === "IMPOSTOR");
const imp = { u: users[impIdx], c: clients[impIdx] };
const victim = crewIdx[1]; // second crewmate (stationary)
const vpos = () => pos.get(victim.u.userId);
await waitEvent(imp.c, "game:tick", () => !!vpos(), 10000).catch(() => {});

const waitLeft = 30000 - (Date.now() - gameStartAt);
if (waitLeft > 0) console.log(`   → kill cooldown: ${Math.ceil(waitLeft / 1000)}sn bekleniyor...`);
await new Promise((r) => setTimeout(r, Math.max(0, waitLeft + 1500)));

const vNow = vpos();
console.log(`   → impostor ${imp.u.name}: kurban ${victim.u.name} @ (${vNow.x.toFixed(1)}, ${vNow.y.toFixed(1)})`);
const dist2 = await walkTo(imp.c, imp.u.userId, vpos, vNow.x, vNow.y, "kurban");

let corpse = null;
let killRes = null;
for (let attempt = 0; attempt < 4 && !killRes?.success; attempt++) {
  // Verify actual distance before each attempt; re-walk if the victim (or we) drifted
  const ip = pos.get(imp.u.userId);
  const vp = vpos();
  if (ip && vp) {
    const d = Math.hypot(vp.x - ip.x, vp.y - ip.y);
    console.log(`   [kill ${attempt}] imp@(${ip.x.toFixed(1)},${ip.y.toFixed(1)}) kurban@(${vp.x.toFixed(1)},${vp.y.toFixed(1)}) d=${d.toFixed(2)}`);
    if (d > 1.3) {
      await walkTo(imp.c, imp.u.userId, () => pos.get(imp.u.userId), vp.x, vp.y, "kurban (yeniden)");
    }
  }
  const corpseP = waitEvent(imp.c, "game:corpseAdded", null, 12000).catch(() => null);
  const killResP = waitEvent(imp.c, "game:killResult", null, 12000).catch(() => null);
  imp.c.emit("game:kill", {});
  killRes = await killResP;
  corpse = await corpseP;
  if (!killRes?.success && /cooldown/i.test(killRes?.message ?? "")) {
    const waitMs = Math.max(0, (killRes.cooldownUntil ?? Date.now()) - Date.now() + 500);
    console.log(`   → kill cooldown aktif, ${Math.ceil(waitMs / 1000)}sn bekleniyor...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
check("Impostor kill başarılı (killResult + corpseAdded)", killRes?.success === true && !!corpse?.corpseId, killRes?.message ?? "");
if (!killRes?.success || !corpse) {
  clients.forEach((c) => c.close());
  console.log(`\n💥 SMOKE FAIL — ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(1);
}

// Report: walker walks to the corpse and reports it
console.log(`   → crew ${walker.u.name}: cesede gidiyor @ (${corpse.x}, ${corpse.y})`);
await walkTo(walker.c, walker.u.userId, () => pos.get(walker.u.userId), corpse.x, corpse.y, "ceset");
const meetingP = waitEvent(walker.c, "game:meetingStarted", null, 10000);
walker.c.emit("game:report", { corpseId: corpse.corpseId });
await meetingP;
check("Ceset raporlandı → toplantı başladı", true);

// Vote: every ALIVE player votes skip
const alive = users.filter((u, i) => started[i].role !== undefined).filter((u) => u.name !== victim.u.name);
const meetingEndP = waitEvent(host, "game:meetingEnded", null, 20000);
for (const u of alive) {
  clients[users.indexOf(u)].emit("game:vote", { targetId: "skip" });
}
const ended = await meetingEndP;
check("Oylama tamamlandı → toplantı bitti", ended.wasTie === true || ended.ejectedId === null || ended.ejectedId === undefined, `wasTie=${ended.wasTie}`);

// Vitals: 1 dead after meeting
await walkTo(imp.c, imp.u.userId, () => pos.get(imp.u.userId), 25, 20, "vitals monitörü");
const vitP = waitEvent(imp.c, "game:monitorResult", (d) => d?.type === "vitals" && d?.data?.players, 10000);
imp.c.emit("game:monitorQuery", { type: "vitals" });
const vit = await vitP;
const deadCount = vit.data.players.filter((p) => !p.isAlive).length;
check("Vitals monitör: 1 ölü gösteriyor", deadCount === 1, `${deadCount} ölü / ${vit.data.players.length} oyuncu`);

// Stats API live
const meRes = await fetch(`${API}/api/stats/me`, { headers: { Cookie: users[0].cookie } });
check("İstatistik API'si ayakta (200)", meRes.status === 200);

clients.forEach((c) => c.close());
const pass = results.every((r) => r.ok);
console.log(`\n${pass ? "🎉 SMOKE PASS" : "💥 SMOKE FAIL"} — ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(pass ? 0 : 1);
