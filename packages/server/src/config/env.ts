// Centralized environment variable loading with validation

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  get isProd(): boolean {
    return this.nodeEnv === "production";
  },
  get isDev(): boolean {
    return this.nodeEnv === "development";
  },
} as const;
