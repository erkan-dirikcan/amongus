// Auth cookie configuration shared between client and server

export const AUTH_COOKIE_NAME = "amongus_token";

// 7 days in milliseconds
export const DEFAULT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Username constraints
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 100;
