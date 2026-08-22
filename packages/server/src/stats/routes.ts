import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export interface StatsMeResponse {
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  tasksCompleted: number;
  winRate: number; // 0-100
}

export interface LeaderboardEntry {
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100
}

export function createStatsRouter(): Router {
  const router = Router();

  // GET /api/stats/me — own UserStats (JWT protected)
  router.get("/me", requireAuth, async (req, res, next) => {
    try {
      const stats = await prisma.userStats.findUnique({
        where: { userId: req.user!.userId },
        include: { user: { select: { username: true } } },
      });

      const response: StatsMeResponse = {
        username: stats?.user.username ?? req.user!.username,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        tasksCompleted: stats?.tasksCompleted ?? 0,
        winRate: stats && stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/stats/leaderboard?limit=20 — top winners (wins DESC, winRate secondary)
  router.get("/leaderboard", requireAuth, async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 50);

      // winRate is derived, not a column: fetch a wider pool then sort in memory
      const pool = await prisma.userStats.findMany({
        take: 200,
        where: { gamesPlayed: { gt: 0 } },
        include: { user: { select: { username: true } } },
      });

      const entries: LeaderboardEntry[] = pool
        .map((s) => ({
          username: s.user.username,
          gamesPlayed: s.gamesPlayed,
          wins: s.wins,
          losses: s.losses,
          winRate: Math.round((s.wins / s.gamesPlayed) * 100),
        }))
        .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
        .slice(0, limit);

      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
