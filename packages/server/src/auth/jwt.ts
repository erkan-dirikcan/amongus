import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    // expiresIn accepts time strings like "7d", "1h" — env value is validated at config layer
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (typeof decoded.userId !== "string" || typeof decoded.username !== "string") {
      return null;
    }
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
