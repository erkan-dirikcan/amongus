import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before each test file's imports evaluate, so env.ts sees the
    // required env vars (JWT_SECRET, DATABASE_URL) at module-load time.
    setupFiles: ["./tests/setup-env.ts"],
  },
});
