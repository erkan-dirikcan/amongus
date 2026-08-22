// Local embedded PostgreSQL — no Docker, no system install required.
// Boots a persistent cluster in <repo>/.local/pg on localhost:5432 with the
// same credentials as docker-compose (amongus / amongus_password), creates
// the dev + test databases, applies Prisma migrations, then idles until Ctrl+C.
//
// Usage: node scripts/local-db.mjs [--fresh]   (--fresh wipes the data dir)
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const dataDir = path.join(repoRoot, ".local", "pg");
const PORT = 5432;
const USER = "amongus";
const PASSWORD = "amongus_password";
const DATABASES = ["amongus", "amongus_test"];

if (process.argv.includes("--fresh") && existsSync(dataDir)) {
  console.log(`[local-db] wiping ${dataDir}`);
  rmSync(dataDir, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log("[local-db] initialising cluster (first run)...");
  await pg.initialise();
}

console.log(`[local-db] starting on localhost:${PORT} ...`);
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT datname FROM pg_database");
const existing = new Set(rows.map((r) => r.datname));
for (const db of DATABASES) {
  if (!existing.has(db)) {
    await pg.createDatabase(db);
    console.log(`[local-db] created database: ${db}`);
  } else {
    console.log(`[local-db] database exists: ${db}`);
  }
}
await client.end();

// Apply migrations to both databases
for (const db of DATABASES) {
  const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${db}?schema=public`;
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

console.log(`[local-db] ready — dev URL:  postgresql://${USER}:${PASSWORD}@localhost:${PORT}/amongus`);
console.log("[local-db] press Ctrl+C to stop");

const shutdown = async () => {
  console.log("\n[local-db] stopping...");
  try {
    await pg.stop();
  } catch {}
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
