import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  resetDatabase,
  disconnectDatabase,
} from "./setup.js";

const app = createApp();

beforeAll(async () => {
  // setup.ts already configures env + DB
});

afterAll(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/auth/register", () => {
  it("creates a new user and returns 201 with user info", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe("alice");
    expect(res.body.user.id).toMatch(/^c/); // cuid prefix
    expect(res.body.user.password).toBeUndefined(); // no password leak
  });

  it("sets an HttpOnly cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", password: "secret123" });

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(String(cookies[0])).toContain("HttpOnly");
    expect(String(cookies[0])).toContain("amongus_token=");
  });

  it("rejects duplicate username with 409", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret456" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("username_taken");
  });

  it("rejects invalid input with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "ab", password: "123" }); // too short

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    // Register a user to log in with
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });
  });

  it("logs in with correct credentials and returns 200", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("rejects unknown user with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ghost", password: "secret123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(204);
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    // Clear cookie sets it empty / expired
    expect(String(cookies[0])).toContain("amongus_token=;");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the logged-in user when authenticated", async () => {
    // Register → grab cookie → use it for /me
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    const cookie = String(registerRes.headers["set-cookie"][0]).split(";")[0];

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });
});

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
