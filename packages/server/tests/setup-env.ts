// Vitest setup file.
//
// env.ts reads process.env at module-load time (required("JWT_SECRET"), etc.),
// and Vitest hoists test-file imports above beforeAll(). So env vars must be
// present BEFORE any test module imports evaluate. A setupFiles entry runs
// before each test file's imports, making the values available when env.ts
// loads. These are test-only fallback values; real secrets come from .env.
process.env.DATABASE_URL ??= "postgresql://amongus:amongus_password@localhost:5433/amongus_test?schema=public";
process.env.JWT_SECRET ??= "test-secret-for-jwt-tests-min-32-chars-long!!";
process.env.JWT_EXPIRES_IN ??= "1h";
