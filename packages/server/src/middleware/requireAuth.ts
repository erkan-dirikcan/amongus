import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME } from "@amongus/shared";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";

// Extend Express Request with authenticated user
declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token", message: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}
