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
    it("creates a lobby with the creator as host", async () => {
      const result = await mgr.createLobby(host);
      expect(result.code).toHaveLength(6);
      expect(result.lobby.hostId).toBe("u1");
      expect(result.lobby.players).toHaveLength(1);
      expect(result.lobby.players[0].isHost).toBe(true);
      expect(result.lobby.players[0].color).toBe("red"); // first color assigned
      expect(result.lobby.status).toBe("LOBBY");
    });

    it("generates unique codes across multiple lobbies", async () => {
      const r1 = await mgr.createLobby(host);
      const r2 = await mgr.createLobby({ userId: "u3", username: "carol", socketId: "s3" });
      expect(r1.code).not.toBe(r2.code);
    });

    it("rejects if user is already in a lobby", async () => {
      await mgr.createLobby(host);
      const result = await mgr.createLobby(host);
      expect(result).toHaveProperty("error");
    });

    it("hashes the password when provided", async () => {
      const result = await mgr.createLobby(host, "secret");
      expect(result.lobby.passwordHash).toBeDefined();
      expect(result.lobby.passwordHash).not.toBe("secret");
    });
  });

  describe("joinLobby", () => {
    beforeEach(async () => {
      await mgr.createLobby(host);
    });

    it("adds a player to an existing lobby", async () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = await mgr.joinLobby(code, guest);
      expect(result).toHaveProperty("lobby");
      if ("lobby" in result) {
        expect(result.lobby.players).toHaveLength(2);
      }
    });

    it("assigns next available color", async () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = await mgr.joinLobby(code, guest);
      if ("lobby" in result) {
        const bob = result.lobby.players.find((p) => p.userId === "u2");
        expect(bob?.color).toBe("blue");
      }
    });

    it("fails for non-existent code", async () => {
      const result = await mgr.joinLobby("ZZZZZZ", guest);
      expect(result).toEqual({ error: "not_found" });
    });

    it("fails when lobby is full", async () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      for (let i = 2; i <= MAX_PLAYERS; i++) {
        await mgr.joinLobby(code, { userId: `u${i}`, username: `p${i}`, socketId: `s${i}` });
      }
      const result = await mgr.joinLobby(code, { userId: "u99", username: "overflow", socketId: "s99" });
      expect(result).toEqual({ error: "full" });
    });

    it("fails when user is already in a lobby", async () => {
      const code = mgr.getLobbyByUser("u1")!.code;
      await mgr.joinLobby(code, guest);
      // bob tries to join again
      const result = await mgr.joinLobby(code, guest);
      expect(result).toHaveProperty("error");
    });

    it("fails with wrong password", async () => {
      mgr = new LobbyManager();
      await mgr.createLobby(host, "correct");
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = await mgr.joinLobby(code, guest, "wrong");
      expect(result).toEqual({ error: "wrong_password" });
    });

    it("succeeds with correct password", async () => {
      mgr = new LobbyManager();
      await mgr.createLobby(host, "correct");
      const code = mgr.getLobbyByUser("u1")!.code;
      const result = await mgr.joinLobby(code, guest, "correct");
      expect(result).toHaveProperty("lobby");
    });
  });

  describe("leaveLobby", () => {
    it("removes a player from their lobby", async () => {
      await mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      await mgr.joinLobby(code, guest);
      const result = mgr.leaveLobby("u2");
      expect(result.removed).toBe(true);
      const lobby = mgr.getLobbyByCode(code);
      expect(lobby?.players).toHaveLength(1);
    });

    it("transfers host when host leaves", async () => {
      await mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      await mgr.joinLobby(code, guest);
      mgr.leaveLobby("u1"); // host leaves
      const lobby = mgr.getLobbyByCode(code);
      expect(lobby?.hostId).toBe("u2");
      expect(lobby?.players[0].isHost).toBe(true);
    });

    it("deletes lobby when last player leaves", async () => {
      await mgr.createLobby(host);
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
    it("flips ready state", async () => {
      await mgr.createLobby(host);
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
    it("changes the player's color if available", async () => {
      await mgr.createLobby(host);
      const result = mgr.setColor("u1", "blue");
      if ("lobby" in result) {
        expect(result.lobby.players[0].color).toBe("blue");
      }
    });

    it("fails if color is taken by another player", async () => {
      await mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      await mgr.joinLobby(code, guest); // bob gets "blue"
      const result = mgr.setColor("u1", "blue");
      expect(result).toEqual({ error: "color_taken" });
    });

    it("fails for invalid color name", async () => {
      await mgr.createLobby(host);
      const result = mgr.setColor("u1", "rainbow");
      expect(result).toEqual({ error: "invalid_color" });
    });
  });

  describe("startLobby", () => {
    it("fails if caller is not host", async () => {
      await mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      await mgr.joinLobby(code, guest);
      const result = mgr.startLobby("u2");
      expect(result).toEqual({ error: "not_host" });
    });

    it("fails if fewer than MIN_PLAYERS", async () => {
      await mgr.createLobby(host);
      const result = mgr.startLobby("u1");
      expect(result).toEqual({ error: "not_enough_players" });
    });

    it("succeeds and sets status to STARTING", async () => {
      await mgr.createLobby(host);
      const code = mgr.getLobbyByUser("u1")!.code;
      for (let i = 2; i <= MIN_PLAYERS; i++) {
        await mgr.joinLobby(code, { userId: `u${i}`, username: `p${i}`, socketId: `s${i}` });
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
    it("strips socketId, joinedAt, and passwordHash", async () => {
      const { lobby } = await mgr.createLobby(host, "secret");
      const state = mgr.toLobbyState(lobby);
      expect(state.players[0]).not.toHaveProperty("socketId");
      expect(state.players[0]).not.toHaveProperty("joinedAt");
      expect(state).not.toHaveProperty("passwordHash");
      expect(state.hasPassword).toBe(true);
    });
  });

  describe("disconnect handling", () => {
    it("removes player by socketId", async () => {
      await mgr.createLobby(host);
      const result = mgr.leaveLobbyBySocket("s1");
      expect(result.removed).toBe(true);
    });
  });
});
