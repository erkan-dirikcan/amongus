import type { CookieOptions, Response } from "express";
import { AUTH_COOKIE_NAME, DEFAULT_COOKIE_MAX_AGE_MS } from "@amongus/shared";
import { env } from "../config/env.js";

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.isProd ? "strict" : "lax",
  maxAge: DEFAULT_COOKIE_MAX_AGE_MS,
  path: "/",
};

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.isProd ? "strict" : "lax",
    path: "/",
  });
}
