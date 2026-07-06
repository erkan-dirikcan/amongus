import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";
import { setAuthCookie, clearAuthCookie } from "./cookie.js";
import { registerSchema, loginSchema, type AuthResponse } from "@amongus/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import type { AppError } from "../middleware/error.js";

export function createAuthRouter(): Router {
  const router = Router();

  // POST /api/auth/register
  router.post("/register", async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(new Error("Validation failed"), { status: 400, code: "validation_error" });
      }
      const { username, password } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        const err: AppError = new Error("Username already taken");
        err.status = 409;
        err.code = "username_taken";
        throw err;
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          stats: { create: {} },
        },
        include: { stats: true },
      });

      const token = signToken({ userId: user.id, username: user.username });
      setAuthCookie(res, token);

      const response: AuthResponse = {
        user: { id: user.id, username: user.username },
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/login
  router.post("/login", async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(new Error("Validation failed"), { status: 400, code: "validation_error" });
      }
      const { username, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        const err: AppError = new Error("Invalid username or password");
        err.status = 401;
        err.code = "invalid_credentials";
        throw err;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        const err: AppError = new Error("Invalid username or password");
        err.status = 401;
        err.code = "invalid_credentials";
        throw err;
      }

      const token = signToken({ userId: user.id, username: user.username });
      setAuthCookie(res, token);

      const response: AuthResponse = {
        user: { id: user.id, username: user.username },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout
  router.post("/logout", (_req, res) => {
    clearAuthCookie(res);
    res.status(204).end();
  });

  // GET /api/auth/me — protected
  router.get("/me", requireAuth, (req, res) => {
    const response: AuthResponse = {
      user: { id: req.user!.userId, username: req.user!.username },
    };
    res.json(response);
  });

  return router;
}
