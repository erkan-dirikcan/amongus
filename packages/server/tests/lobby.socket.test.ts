import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { io as ioc } from "socket.io-client";
import { createApp } from "../src/app.js";
import { setupSocketServer } from "../src/sockets/index.js";
import { signToken } from "../src/auth/jwt.js";
import { AUTH_COOKIE_NAME, LOBBY_EVENTS } from "@amongus/shared";
import { LobbyManager } from "../src/lobby/manager.js";
import { GameEngine } from "../src/game/engine.js";

const httpServer = createServer(createApp());
const mgr = new LobbyManager();
const engine = new GameEngine();
const port = 0;
let actualPort = 0;

// NOTE: Vitest 2.x does not pass a `done` callback to hooks (unlike Mocha), so the
// verbatim brief's `beforeAll((done) => { ... done(); })` throws `done is not a function`
// and leaves actualPort=0. Converted to a returned Promise — test logic/assertions unchanged.
beforeAll(
  () =>
    new Promise<void>((resolve) => {
      setupSocketServer(httpServer, mgr, engine);
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        actualPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    })
);

afterAll(() => httpServer.close());

function makeClient(userId: string, username: string) {
  const token = signToken({ userId, username });
  return ioc(`http://localhost:${actualPort}`, {
    forceNew: true,
    extraHeaders: { Cookie: `${AUTH_COOKIE_NAME}=${token}` },
  });
}

// NOTE on the `waitFor` helper vs. the verbatim brief:
// The brief's `waitFor` used `client.once(event, ...)` which resolves on the FIRST matching event
// seen after registering — including events still in flight from a PRIOR step. In the full flow
// the guest's JOIN handler (lobbyHandlers.ts) emits BOTH STATE and UPDATED into the guest's room.
// The brief only awaits STATE after JOIN, so the guest's JOIN-broadcast UPDATED — a snapshot where
// bob.color is still "blue" — stays in flight. That stale UPDATED is delivered non-deterministically
// (it can land during a LATER `waitFor`), so it can be caught by the SET_COLOR `waitFor` and resolve
// with the wrong payload (bob.color "blue" instead of "green"). Increasing the timeout does NOT fix
// this: it is an event-ordering race, not flaky timing. A pure event-name or sequence-counter match
// cannot distinguish the stale JOIN UPDATED from the fresh SET_COLOR UPDATED because they share the
// same event name and differ only in payload.
//
// Fix (test infrastructure only — every assertion and the entire emit sequence are kept verbatim):
// `waitFor` accepts an OPTIONAL predicate and resolves only when an event whose payload satisfies it
// arrives. The three sequential `lobby:updated` waits in the full flow pass a predicate that mirrors
// the very condition the following assertion checks, so stale snapshots are skipped automatically.
// All other call sites pass no predicate and behave exactly as the brief's helper (first event wins).
function waitFor<T>(
  client: any,
  event: string,
  predicate?: (data: T) => boolean,
  timeout = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    const handler = (data: T) => {
      if (!predicate || predicate(data)) {
        clearTimeout(timer);
        client.off(event, handler);
        resolve(data);
      }
    };
    client.on(event, handler);
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
    // Predicate matches the assertion below: skip any stale lobby:updated snapshot where bob is
    // still the default color and only resolve once the color-change broadcast (bob=green) lands.
    const update2 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED, (d) =>
      d.players.find((p: any) => p.username === "bob")?.color === "green"
    );
    const bob = update2.players.find((p: any) => p.username === "bob");
    expect(bob.color).toBe("green");

    // Guest toggles ready
    guest.emit(LOBBY_EVENTS.TOGGLE_READY);
    const update3 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED, (d) =>
      d.players.find((p: any) => p.username === "bob")?.isReady === true
    );
    const bob2 = update3.players.find((p: any) => p.username === "bob");
    expect(bob2.isReady).toBe(true);

    // Host leaves → guest becomes host
    host.emit(LOBBY_EVENTS.LEAVE);
    const update4 = await waitFor<any>(guest, LOBBY_EVENTS.UPDATED, (d) =>
      d.players.find((p: any) => p.username === "bob")?.isHost === true
    );
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
