import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env.js";
import { createAuthRouter } from "./auth/routes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // CORS: dev'de Vite (5173) → API (3000)
  app.use(
    cors({
      origin: env.isProd ? false : ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    })
  );

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Auth routes
  app.use("/api/auth", createAuthRouter());

  // 404 + error handling (last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
