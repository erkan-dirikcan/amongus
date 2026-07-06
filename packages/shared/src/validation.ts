import { z } from "zod";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./constants.js";

// Username: 3-20 alphanumeric chars + underscore, trimmed
const usernameField = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const registerSchema = z.object({
  username: usernameField,
  password: passwordField,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ─── Lobby validation schemas ─────────────────────────────────────────

export const lobbyCreateSchema = z.object({
  password: z.string().min(1).max(100).optional(),
});

export const lobbyJoinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(6, "Lobby code must be 6 characters"),
  password: z.string().min(1).max(100).optional(),
});

export const lobbySetColorSchema = z.object({
  color: z.string().min(1).max(20),
});
