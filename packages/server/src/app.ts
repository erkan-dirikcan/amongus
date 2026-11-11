import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { createAuthRouter } from "./auth/routes.js";
import { createStatsRouter } from "./stats/routes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp(): express.Application {
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());

  // CORS: dev'de Vite (5173) → API (3000)
  app.use(
    cors({
      origin: env.isProd ? true : ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    })
  );

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Auth routes
  app.use("/api/auth", createAuthRouter());

  // Stats routes (JWT protected)
  app.use("/api/stats", createStatsRouter());

  // Serve client in production
  if (env.isProd) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, "../../client/dist");
    app.use(express.static(clientDist));
    // SPA fallback: non-API routes return index.html
    app.get("*", (req, res, next) => {
      if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
        res.sendFile(path.join(clientDist, "index.html"));
      } else {
        next();
      }
    });
  }

  // 404 + error handling (last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
