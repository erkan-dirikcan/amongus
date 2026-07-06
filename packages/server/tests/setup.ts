import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Use a separate test database via DATABASE_URL env (set in vitest config)
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://amongus:amongus_password@localhost:5432/amongus_test?schema=public";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-long-aaaaaaaaaa!!";
process.env.JWT_EXPIRES_IN = "1h";
process.env.COOKIE_SECURE = "false";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

export async function resetDatabase(): Promise<void> {
  // Reset tables between tests for isolation
  await prisma.userStats.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma as testPrisma };
