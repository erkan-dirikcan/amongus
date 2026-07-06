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
