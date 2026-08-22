import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // DB-backed suites share one test database with per-test resets —
    // parallel files would wipe each other's rows mid-test.
    fileParallelism: false,
  },
});
