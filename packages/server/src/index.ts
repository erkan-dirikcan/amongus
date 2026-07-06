import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

async function main(): Promise<void> {
  // Verify DB connectivity at startup
  try {
    await prisma.$connect();
    console.log(`[server] Connected to database`);
  } catch (err) {
    console.error("[server] Failed to connect to database:", err);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] Among Us API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
