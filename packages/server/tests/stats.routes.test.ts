import { describe, it, expect, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDatabase, disconnectDatabase, testPrisma } from "./setup.js";

const app = createApp();

afterAll(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

async function registerAndLogin(username: string): Promise<request.Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ username, password: "secret123" });
  return agent;
}

describe("GET /api/stats/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/stats/me");
    expect(res.status).toBe(401);
  });

  it("returns own stats with computed winRate", async () => {
    const agent = await registerAndLogin("alice");

    const meRes = await agent.get("/api/auth/me");
    const userId = meRes.body.user.id;

    await testPrisma.userStats.update({
      where: { userId },
      data: { gamesPlayed: 4, wins: 3, losses: 1, tasksCompleted: 11 },
    });

    const res = await agent.get("/api/stats/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: "alice",
      gamesPlayed: 4,
      wins: 3,
      losses: 1,
      tasksCompleted: 11,
      winRate: 75,
    });
  });

  it("returns zeros for a fresh account", async () => {
    const agent = await registerAndLogin("fresh");
    const res = await agent.get("/api/stats/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 });
  });
});

describe("GET /api/stats/leaderboard", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/stats/leaderboard");
    expect(res.status).toBe(401);
  });

  it("orders by wins desc, winRate as tiebreaker", async () => {
    const agent = await registerAndLogin("viewer");

    const setup = async (username: string, games: number, wins: number) => {
      const a = await registerAndLogin(username);
      const me = await a.get("/api/auth/me");
      await testPrisma.userStats.update({
        where: { userId: me.body.user.id },
        data: { gamesPlayed: games, wins, losses: games - wins },
      });
    };

    await setup("low", 10, 1); // 1 win, 10%
    await setup("high", 10, 5); // 5 wins → top
    await setup("mid_a", 2, 1); // 1 win, 50%
    await setup("mid_b", 4, 1); // 1 win, 25%

    const res = await agent.get("/api/stats/leaderboard");
    expect(res.status).toBe(200);
    const names = res.body.entries.map((e: any) => e.username);
    // wins desc; among 1-win players, higher winRate first
    expect(names).toEqual(["high", "mid_a", "mid_b", "low"]);
    expect(res.body.entries[0].winRate).toBe(50);
  });

  it("respects the limit parameter", async () => {
    const agent = await registerAndLogin("viewer");
    for (let i = 0; i < 5; i++) {
      const a = await registerAndLogin(`player${i}`);
      const me = await a.get("/api/auth/me");
      await testPrisma.userStats.update({
        where: { userId: me.body.user.id },
        data: { gamesPlayed: 1, wins: 1 },
      });
    }
    const res = await agent.get("/api/stats/leaderboard?limit=3");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
  });
});
