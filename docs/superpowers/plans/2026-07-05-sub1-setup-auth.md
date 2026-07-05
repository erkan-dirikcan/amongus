# Sub-project 1: Temel Kurulum + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Among Us klonu için temel altyapıyı kurmak: monorepo yapısı, Docker Compose, PostgreSQL, Prisma, ve tam çalışan kullanıcı kayıt/giriş sistemi (JWT tabanlı).

**Architecture:** npm workspaces ile monorepo (3 paket: shared, server, client). Backend Express + Prisma + PostgreSQL. Auth, bcrypt + JWT (HttpOnly cookie). Tüm sistem Docker Compose ile tek komutta ayağa kalkar. Bu sub-project'in sonunda: kullanıcı kayıt olabilir, giriş yapabilir, korunan bir endpoint'e erişebilir.

**Tech Stack:** Node 24, TypeScript, npm workspaces, Express 4, Prisma 5, PostgreSQL 16, bcrypt, jsonwebtoken, zod, vitest, Docker Compose.

## Global Constraints

- Node.js v24+ (kullanıcı ortamında v24.16.0 mevcut)
- TypeScript strict mode açık (`"strict": true`)
- Tüm bağımlılıklar `package.json`'da sabitlenmiş major sürümlerle
- Tüm kod İngilizce (değişkenler, fonksiyonlar, yorumlar)
- Commit mesajları conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- Her task'tan sonra commit
- Şifre hashleme: bcrypt 10 rounds
- JWT: HttpOnly + Secure(prod) + SameSite=Strict cookie'de
- Validasyon: Zod ile her input payload
- TDD: önce failing test, sonra implementation

---

## File Structure (Sub-project 1'in sonundaki durum)

```
amongus/
├── .gitignore
├── .env.example
├── package.json                    # Root workspace
├── docker-compose.yml
├── README.md
├── packages/
│   ├── shared/                     # Client+server ortak tipler
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts            # API tipleri (RegisterRequest vb.)
│   │       ├── constants.ts        # Cookie adı, süreler
│   │       └── validation.ts       # Zod şemaları (register, login)
│   ├── server/                     # Node.js backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── prisma/
│   │   │   └── schema.prisma       # User + UserStats modelleri
│   │   ├── src/
│   │   │   ├── index.ts            # Express app başlatma
│   │   │   ├── app.ts              # Express app (test edilebilir)
│   │   │   ├── config/
│   │   │   │   └── env.ts          # Ortam değişkenleri yükleme
│   │   │   ├── db/
│   │   │   │   └── prisma.ts       # Prisma client singleton
│   │   │   ├── auth/
│   │   │   │   ├── password.ts     # hash/compare
│   │   │   │   ├── jwt.ts          # sign/verify
│   │   │   │   ├── cookie.ts       # cookie set/clear helper
│   │   │   │   └── routes.ts       # /api/auth/register, /login, /me
│   │   │   └── middleware/
│   │   │       ├── error.ts        # Merkezi hata yakalama
│   │   │       └── requireAuth.ts  # JWT doğrulama middleware
│   │   └── tests/
│   │       ├── setup.ts            # Test DB, before/after each
│   │       ├── auth.password.test.ts
│   │       ├── auth.jwt.test.ts
│   │       └── auth.routes.test.ts
│   └── client/                     # (Sub-project 1'de boş placeholder)
│       ├── package.json
│       └── src/
│           └── main.ts             # "Coming soon" placeholder
└── docs/superpowers/
    ├── specs/2026-07-05-amongus-clone-design.md
    └── plans/2026-07-05-sub1-setup-auth.md   # Bu dosya
```

---

## Task 1: Monorepo Kök Yapısı

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Produces: npm workspace kökü, `packages/*` workspace tanımı

- [ ] **Step 1: Kök `package.json` oluştur**

```json
{
  "name": "amongus",
  "private": true,
  "version": "0.1.0",
  "description": "Web-based Among Us clone for friends",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "echo \"TODO: add linter in later sub-project\" && exit 0"
  },
  "engines": {
    "node": ">=24.0.0"
  }
}
```

- [ ] **Step 2: `.gitignore` oluştur**

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# Editor / OS
.DS_Store
.vscode/
.idea/
Thumbs.db

# Test coverage
coverage/

# Prisma
packages/server/prisma/migrations/dev.db
*.db-journal
```

- [ ] **Step 3: `.env.example` oluştur**

```bash
# Server
NODE_ENV=development
PORT=3000

# Database (Docker Compose kullanırken bu değerleri override eder)
DATABASE_URL="postgresql://amongus:amongus_password@localhost:5432/amongus?schema=public"

# Auth
JWT_SECRET="change-me-to-a-long-random-string-in-production"
JWT_EXPIRES_IN="7d"

# Cookie (production'da true olmalı)
COOKIE_SECURE=false

# Client
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 4: `README.md` oluştur**

```markdown
# Among Us Clone

Web-based Among Us clone for playing with friends. Built with Node.js, Socket.io, Phaser, and PostgreSQL.

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# JWT_SECRET ve DATABASE_URL değerlerini düzenleyin
docker compose up -d
```

Tarayıcıdan: http://localhost:3000

## Development

Gereksinimler: Node.js 24+, npm 11+

```bash
npm install
npm run dev
```

## Documentation

- [Tasarım Dokümanı](docs/superpowers/specs/2026-07-05-amongus-clone-design.md)
- [Sub-project 1 Planı](docs/superpowers/plans/2026-07-05-sub1-setup-auth.md)

## Status

🚧 Geliştirme aşamasında — Sub-project 1: Temel Kurulum + Auth
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .env.example README.md
git commit -m "chore: initialize monorepo root structure"
```

---

## Task 2: `shared` Paketi — Tipler ve Validasyon

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/validation.ts`
- Test: `packages/shared/src/validation.test.ts`

**Interfaces:**
- Produces: `@amongus/shared` paketi, şu export'lar:
  - `types.ts`: `RegisterRequest`, `LoginRequest`, `AuthUser`, `AuthResponse`, `ApiError`
  - `constants.ts`: `AUTH_COOKIE_NAME`, `DEFAULT_COOKIE_MAX_AGE_MS`
  - `validation.ts`: `registerSchema`, `loginSchema` (Zod şemaları)
- Consumes: hiçbir şey (temel)

- [ ] **Step 1: `packages/shared/package.json`**

```json
{
  "name": "@amongus/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `packages/shared/src/types.ts`**

```typescript
// API request/response types shared between client and server

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface ApiError {
  error: string;
  message: string;
}
```

- [ ] **Step 4: `packages/shared/src/constants.ts`**

```typescript
// Auth cookie configuration shared between client and server

export const AUTH_COOKIE_NAME = "amongus_token";

// 7 days in milliseconds
export const DEFAULT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Username constraints
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 100;
```

- [ ] **Step 5: Failing test yaz — `packages/shared/src/validation.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "./validation.js";

describe("registerSchema", () => {
  const validInput = { username: "alice", password: "secret123" };

  it("accepts valid input", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 3 chars", () => {
    const result = registerSchema.safeParse({ username: "ab", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 20 chars", () => {
    const result = registerSchema.safeParse({ username: "a".repeat(21), password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects username with special chars", () => {
    const result = registerSchema.safeParse({ username: "alice!", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 6 chars", () => {
    const result = registerSchema.safeParse({ username: "alice", password: "12345" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from username", () => {
    const result = registerSchema.safeParse({ username: "  alice  ", password: "secret123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("alice");
    }
  });
});

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({ username: "alice", password: "secret123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty username", () => {
    const result = loginSchema.safeParse({ username: "", password: "secret123" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ username: "alice", password: "" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6: Test'i çalıştır, başarısız olduğunu doğrula**

Run: `cd packages/shared && npm install && npx vitest run`
Expected: FAIL — `Cannot find module './validation.js'`

- [ ] **Step 7: Implementation — `packages/shared/src/validation.ts`**

```typescript
import { z } from "zod";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./constants.js";

// Username: 3-20 alphanumeric chars + underscore, trimmed
const usernameField = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const registerSchema = z.object({
  username: usernameField,
  password: passwordField,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
```

- [ ] **Step 8: `packages/shared/src/index.ts` — barrel export**

```typescript
export * from "./types.js";
export * from "./constants.js";
export * from "./validation.js";
```

- [ ] **Step 9: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/shared && npx vitest run`
Expected: PASS — tüm testler yeşil

- [ ] **Step 10: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add types, constants, and Zod validation schemas with tests"
```

---

## Task 3: `server` Paketi — Temel Kurulum ve Prisma

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/config/env.ts`
- Create: `packages/server/src/db/prisma.ts`
- Create: `packages/server/prisma/schema.prisma`

**Interfaces:**
- Produces:
  - `env` objesi: `{ nodeEnv, port, databaseUrl, jwtSecret, jwtExpiresIn, cookieSecure, isProd }`
  - `prisma` singleton: Prisma Client instance
  - Prisma modelleri: `User`, `UserStats`
- Consumes: `@amongus/shared`

- [ ] **Step 1: `packages/server/package.json`**

```json
{
  "name": "@amongus/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@amongus/shared": "*",
    "@prisma/client": "^5.18.0",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^24.0.0",
    "prisma": "^5.18.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: `packages/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: `packages/server/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String      @id @default(cuid())
  username     String      @unique
  passwordHash String
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  stats        UserStats?

  @@index([username])
}

model UserStats {
  userId         String   @id
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  gamesPlayed    Int      @default(0)
  wins           Int      @default(0)
  losses         Int      @default(0)
  tasksCompleted Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 4: `packages/server/src/config/env.ts`**

```typescript
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
```

- [ ] **Step 5: `packages/server/src/db/prisma.ts` — Prisma singleton**

```typescript
import { PrismaClient } from "@prisma/client";

// Singleton pattern: prevent multiple PrismaClient instances in dev (hot reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Bağımlılıkları yükle ve Prisma client'ı generate et**

Run: `cd packages/server && npm install`
Run: `cd packages/server && npx prisma generate`
Expected: `generated client` başarı mesajı

- [ ] **Step 7: TypeScript derlemesini doğrula**

Run: `cd packages/server && npx tsc --noEmit`
Expected: hata yok (henüz index.ts yoksa boş bir `src/index.ts` placeholder ekle)

Eğer hata varsa `src/index.ts` oluştur:
```typescript
// Placeholder — real entry point added in Task 6
console.log("amongus server — placeholder");
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/
git commit -m "feat(server): add package setup, Prisma schema, env config, and Prisma client singleton"
```

---

## Task 4: Password Hashing (bcrypt)

**Files:**
- Create: `packages/server/src/auth/password.ts`
- Test: `packages/server/tests/auth.password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>` — bcrypt hash döner
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
- Consumes: `bcrypt` package

- [ ] **Step 1: Failing test yaz — `packages/server/tests/auth.password.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("hashPassword", () => {
  it("returns a bcrypt hash that differs from plaintext", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).not.toBe("mypassword");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
  });

  it("produces different hashes for same input (salt)", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correctpass");
    const isValid = await verifyPassword("correctpass", hash);
    expect(isValid).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correctpass");
    const isValid = await verifyPassword("wrongpass", hash);
    expect(isValid).toBe(false);
  });

  it("returns false for malformed hash", async () => {
    const isValid = await verifyPassword("anypass", "not-a-real-hash");
    expect(isValid).toBe(false);
  });
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu doğrula**

Run: `cd packages/server && npx vitest run tests/auth.password.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/password.js'`

- [ ] **Step 3: Implementation — `packages/server/src/auth/password.ts`**

```typescript
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return bcrypt.compare(plain, hash);
  } catch {
    // Malformed hash or other error → treat as invalid
    return false;
  }
}
```

- [ ] **Step 4: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/server && npx vitest run tests/auth.password.test.ts`
Expected: PASS — 5 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/password.ts packages/server/tests/auth.password.test.ts
git commit -m "feat(server): add bcrypt password hashing with tests"
```

---

## Task 5: JWT Sign/Verify

**Files:**
- Create: `packages/server/src/auth/jwt.ts`
- Test: `packages/server/tests/auth.jwt.test.ts`

**Interfaces:**
- Produces:
  - `signToken(payload: JwtPayload): string` — JWT string döner
  - `verifyToken(token: string): JwtPayload | null` — geçersizse null
  - `JwtPayload` tipi: `{ userId: string; username: string }`
- Consumes: `env.jwtSecret`, `env.jwtExpiresIn` (Task 3'ten)

- [ ] **Step 1: Failing test yaz — `packages/server/tests/auth.jwt.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { signToken, verifyToken, type JwtPayload } from "../src/auth/jwt.js";

// Set env vars before importing config
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-jwt-tests-min-32-chars-long!!";
  process.env.JWT_EXPIRES_IN = "1h";
});

describe("signToken and verifyToken", () => {
  const payload: JwtPayload = { userId: "user-123", username: "alice" };

  it("signs and verifies a valid token", () => {
    const token = signToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user-123");
    expect(decoded?.username).toBe("alice");
  });

  it("returns null for invalid token string", () => {
    const decoded = verifyToken("not.a.valid.token");
    expect(decoded).toBeNull();
  });

  it("returns null for token signed with different secret", () => {
    const token = signToken(payload);
    // Tamper: flip last char
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const decoded = verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  it("includes issued-at and expiry claims", () => {
    const token = signToken(payload);
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });
});
```

- [ ] **Step 2: Test'i çalıştır, başarısız olduğunu doğrula**

Run: `cd packages/server && npx vitest run tests/auth.jwt.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/jwt.js'`

- [ ] **Step 3: Implementation — `packages/server/src/auth/jwt.ts`**

```typescript
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (typeof decoded.userId !== "string" || typeof decoded.username !== "string") {
      return null;
    }
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Test'i çalıştır, geçtiğini doğrula**

Run: `cd packages/server && npx vitest run tests/auth.jwt.test.ts`
Expected: PASS — 4 test yeşil

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/jwt.ts packages/server/tests/auth.jwt.test.ts
git commit -m "feat(server): add JWT sign/verify with tests"
```

---

## Task 6: Auth Cookie Helper

**Files:**
- Create: `packages/server/src/auth/cookie.ts`

**Interfaces:**
- Produces:
  - `setAuthCookie(res: Response, token: string): void`
  - `clearAuthCookie(res: Response): void`
  - `AUTH_COOKIE_OPTIONS` (export)
- Consumes: `@amongus/shared` (`AUTH_COOKIE_NAME`, `DEFAULT_COOKIE_MAX_AGE_MS`), `env.cookieSecure`, `env.isProd`

- [ ] **Step 1: Implementation — `packages/server/src/auth/cookie.ts`**

```typescript
import type { CookieOptions, Response } from "express";
import { AUTH_COOKIE_NAME, DEFAULT_COOKIE_MAX_AGE_MS } from "@amongus/shared";
import { env } from "../config/env.js";

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.isProd ? "strict" : "lax",
  maxAge: DEFAULT_COOKIE_MAX_AGE_MS,
  path: "/",
};

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.isProd ? "strict" : "lax",
    path: "/",
  });
}
```

Not: Cookie helper basit olduğu için (pure config + wrapper) ayrı birim testi yazılmıyor. Davranış, Task 8'deki route testleriyle doğrulanacak.

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/auth/cookie.ts
git commit -m "feat(server): add auth cookie helper (HttpOnly, SameSite, Secure)"
```

---

## Task 7: requireAuth Middleware

**Files:**
- Create: `packages/server/src/middleware/requireAuth.ts`

**Interfaces:**
- Produces:
  - `requireAuth(req, res, next)` — Express middleware
  - `req.user` alanını `{ userId, username }` olarak set eder (genişletilmiş Request tipi)
  - Geçersiz/eksik token → `401 Unauthorized`
- Consumes: `verifyToken` (Task 5), `AUTH_COOKIE_NAME`

- [ ] **Step 1: Implementation — `packages/server/src/middleware/requireAuth.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME } from "@amongus/shared";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";

// Extend Express Request with authenticated user
declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token", message: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}
```

Not: Middleware, Task 8'deki `/api/auth/me` route testi ile doğrulanacak.

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/middleware/requireAuth.ts
git commit -m "feat(server): add requireAuth middleware with JWT verification"
```

---

## Task 8: Express App + Error Middleware + Auth Routes

**Files:**
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/middleware/error.ts`
- Create: `packages/server/src/auth/routes.ts`
- Create: `packages/server/tests/setup.ts`
- Test: `packages/server/tests/auth.routes.test.ts`

**Interfaces:**
- Produces:
  - `createApp()` → yapılandırılmış Express app (test edilebilir factory)
  - `POST /api/auth/register` → `{ user: AuthUser }` + cookie set
  - `POST /api/auth/login` → `{ user: AuthUser }` + cookie set
  - `POST /api/auth/logout` → cookie clear
  - `GET /api/auth/me` → `{ user: AuthUser }` (requireAuth)
  - Merkezi error handler
- Consumes: tüm önceki task'lar

- [ ] **Step 1: Test setup — `packages/server/tests/setup.ts`**

```typescript
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
```

- [ ] **Step 2: Vitest config — `packages/server/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 3: Error middleware — `packages/server/src/middleware/error.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Invalid input",
      details: err.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return;
  }

  const status = err.status ?? 500;
  const code = err.code ?? "internal_error";

  if (status >= 500) {
    console.error("[server] Unhandled error:", err);
  }

  res.status(status).json({
    error: code,
    message: status >= 500 ? "Internal server error" : err.message,
  });
}
```

- [ ] **Step 4: Auth routes — `packages/server/src/auth/routes.ts`**

```typescript
import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";
import { setAuthCookie, clearAuthCookie } from "./cookie.js";
import { registerSchema, loginSchema, type AuthResponse } from "@amongus/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import type { AppError } from "../middleware/error.js";

export function createAuthRouter(): Router {
  const router = Router();

  // POST /api/auth/register
  router.post("/register", async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(new Error("Validation failed"), { status: 400, code: "validation_error" });
      }
      const { username, password } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        const err: AppError = new Error("Username already taken");
        err.status = 409;
        err.code = "username_taken";
        throw err;
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          stats: { create: {} },
        },
        include: { stats: true },
      });

      const token = signToken({ userId: user.id, username: user.username });
      setAuthCookie(res, token);

      const response: AuthResponse = {
        user: { id: user.id, username: user.username },
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/login
  router.post("/login", async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(new Error("Validation failed"), { status: 400, code: "validation_error" });
      }
      const { username, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        const err: AppError = new Error("Invalid username or password");
        err.status = 401;
        err.code = "invalid_credentials";
        throw err;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        const err: AppError = new Error("Invalid username or password");
        err.status = 401;
        err.code = "invalid_credentials";
        throw err;
      }

      const token = signToken({ userId: user.id, username: user.username });
      setAuthCookie(res, token);

      const response: AuthResponse = {
        user: { id: user.id, username: user.username },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout
  router.post("/logout", (_req, res) => {
    clearAuthCookie(res);
    res.status(204).end();
  });

  // GET /api/auth/me — protected
  router.get("/me", requireAuth, (req, res) => {
    const response: AuthResponse = {
      user: { id: req.user!.userId, username: req.user!.username },
    };
    res.json(response);
  });

  return router;
}
```

- [ ] **Step 5: Express app factory — `packages/server/src/app.ts`**

```typescript
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
```

- [ ] **Step 6: Failing route test yaz — `packages/server/tests/auth.routes.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  resetDatabase,
  disconnectDatabase,
} from "./setup.js";

const app = createApp();

beforeAll(async () => {
  // setup.ts already configures env + DB
});

afterAll(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/auth/register", () => {
  it("creates a new user and returns 201 with user info", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe("alice");
    expect(res.body.user.id).toMatch(/^c/); // cuid prefix
    expect(res.body.user.password).toBeUndefined(); // no password leak
  });

  it("sets an HttpOnly cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", password: "secret123" });

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(String(cookies[0])).toContain("HttpOnly");
    expect(String(cookies[0])).toContain("amongus_token=");
  });

  it("rejects duplicate username with 409", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret456" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("username_taken");
  });

  it("rejects invalid input with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "ab", password: "123" }); // too short

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    // Register a user to log in with
    await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });
  });

  it("logs in with correct credentials and returns 200", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("rejects unknown user with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ghost", password: "secret123" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(204);
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    // Clear cookie sets it empty / expired
    expect(String(cookies[0])).toContain("amongus_token=;");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the logged-in user when authenticated", async () => {
    // Register → grab cookie → use it for /me
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret123" });

    const cookie = String(registerRes.headers["set-cookie"][0]).split(";")[0];

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });
});

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
```

- [ ] **Step 7: Test bağımlılığını ekle**

`packages/server/package.json`'da `devDependencies`'e ekle:
```json
"supertest": "^7.0.0",
"@types/supertest": "^6.0.2"
```

Run: `cd packages/server && npm install`

- [ ] **Step 8: Test DB migration**

Test DB'sini oluştur (PostgreSQL çalışıyor olmalı):
```bash
# Eğer PostgreSQL locale kuruluysa:
createdb amongus_test
# Veya psql üzerinden: CREATE DATABASE amongus_test;
```

Sonra schema'yı push et:
```bash
cd packages/server
DATABASE_URL="postgresql://amongus:amongus_password@localhost:5432/amongus_test?schema=public" npx prisma db push
```

- [ ] **Step 9: Test'i çalıştır**

Run: `cd packages/server && npx vitest run tests/auth.routes.test.ts`
Expected: PASS — tüm route testleri yeşil (implementation Step 4-5'te, test DB'si Step 8'de hazır)

Not: Bu bir integration test'tir (TDD birim testinden farklı). Implementation (app + routes) ve test DB'si hazır olduğu için testin ilk çalıştırmasında geçmesi beklenir. Eğer FAIL olursa: (a) PostgreSQL çalışmıyor, (b) test DB'si oluşturulmadı, veya (c) bir bug var — hata mesajını okuyup düzelt.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/auth/routes.ts packages/server/src/middleware/error.ts packages/server/tests/ packages/server/vitest.config.ts packages/server/package.json
git commit -m "feat(server): add Express app, auth routes (register/login/logout/me) with integration tests"
```

---

---

## Task 9: Server Entry Point

**Files:**
- Create: `packages/server/src/index.ts`

**Interfaces:**
- Produces: Çalışan HTTP server (`npm run dev` ile)
- Consumes: `createApp()` (Task 8), `env`

- [ ] **Step 1: Implementation — `packages/server/src/index.ts`**

```typescript
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
```

- [ ] **Step 2: Manuel smoke test**

```bash
cd packages/server
# .env dosyası kökte olmalı (Task 1'de oluşturuldu)
# DATABASE_URL pointing to a running PostgreSQL
npm run dev
```

Başka bir terminalde:
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":...}

curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
# Expected: 201 + user object
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): add server entry point with graceful shutdown"
```

---

## Task 10: `client` Paketi Placeholder

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/src/main.ts`

**Interfaces:**
- Produces: `@amongus/client` workspace (Sub-project 2'de Phaser ile doldurulacak)

- [ ] **Step 1: `packages/client/package.json`**

```json
{
  "name": "@amongus/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/main.ts",
  "scripts": {
    "dev": "echo \"Client dev server comes in Sub-project 2\" && exit 0",
    "build": "echo \"Client build comes in Sub-project 2\" && exit 0"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: `packages/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `packages/client/src/main.ts`**

```typescript
// Placeholder — Phaser + Vite setup comes in Sub-project 2
console.log("amongus client — placeholder (Sub-project 2 will build the UI)");
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/
git commit -m "chore(client): add client package placeholder for workspace"
```

---

## Task 11: Docker Setup

**Files:**
- Create: `packages/server/Dockerfile`
- Create: `docker-compose.yml`
- Modify: `packages/server/.dockerignore` (create)

**Interfaces:**
- Produces: `docker compose up` ile tüm sistemi ayağa kaldırma

- [ ] **Step 1: `packages/server/.dockerignore`**

```dockerignore
node_modules
dist
tests
*.md
.env
.env.*
.git
```

- [ ] **Step 2: `packages/server/Dockerfile`**

```dockerfile
# Multi-stage build: build TypeScript, then run lean

FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace root manifests first (better layer caching)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install all workspace deps
RUN npm install

# Copy source
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Generate Prisma client
RUN npm run db:generate --workspace @amongus/server

# Build server
RUN npm run build --workspace @amongus/server

# --- Production stage ---
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/client/package.json ./packages/client/package.json

# Install only production deps
RUN npm install --omit=dev

# Copy built server + shared source (needed at runtime via workspace symlink)
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# Run Prisma migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/server/prisma/schema.prisma && node packages/server/dist/index.js"]
```

- [ ] **Step 3: `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: amongus-db
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-amongus}
      POSTGRES_USER: ${POSTGRES_USER:-amongus}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-amongus_password}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-amongus}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    container_name: amongus-app
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-amongus}:${POSTGRES_PASSWORD:-amongus_password}@db:5432/${POSTGRES_DB:-amongus}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-7d}
      COOKIE_SECURE: ${COOKIE_SECURE:-true}
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  pgdata:
```

- [ ] **Step 4: `.env.example`'i güncelle (PostgreSQL Docker değişkenleri ekle)**

`.env.example` dosyasına ekle (Task 1'deki içeriğin sonuna):

```bash
# Docker Compose - PostgreSQL
POSTGRES_DB=amongus
POSTGRES_USER=amongus
POSTGRES_PASSWORD=change_me_to_a_strong_password
```

- [ ] **Step 5: İlk Prisma migration oluştur**

```bash
cd packages/server
npx prisma migrate dev --name init --create-only
```

Bu `packages/server/prisma/migrations/<timestamp>_init/` klasörünü oluşturur.

- [ ] **Step 6: Commit**

```bash
git add packages/server/Dockerfile packages/server/.dockerignore packages/server/prisma/migrations docker-compose.yml .env.example
git commit -m "feat: add Docker setup (Dockerfile + docker-compose) with Prisma migrations"
```

---

## Task 12: İlk Prisma Migration ve Smoke Test

**Files:**
- Modify: `packages/server/prisma/migrations/` (oluşturuldu)

- [ ] **Step 1: Migration'ı uygula (dev DB'sine)**

```bash
cd packages/server
# DATABASE_URL .env'de set olmalı ve PostgreSQL çalışıyor olmalı
npx prisma migrate dev
```

Expected: migration uygulanır, `User` ve `UserStats` tabloları oluşturulur.

- [ ] **Step 2: Tüm test suite'i çalıştır**

```bash
cd packages/server && npx vitest run
```

Expected: tüm testler yeşil (password, jwt, routes).

- [ ] **Step 3: Manuel smoke test (curl ile)**

```bash
# Server'ı başlat
cd packages/server && npm run dev &

# Health
curl -s http://localhost:3000/api/health | jq
# {"status":"ok","timestamp":1234567890}

# Register
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}' \
  -c cookies.txt | jq
# {"user":{"id":"...","username":"testuser"}}

# Me (cookie ile)
curl -s http://localhost:3000/api/auth/me -b cookies.txt | jq
# {"user":{"id":"...","username":"testuser"}}

# Login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}' | jq
# {"user":{"id":"...","username":"testuser"}}

# Logout
curl -s -X POST http://localhost:3000/api/auth/logout | jq
# (204 No Content)

# Me (cookie silindi, 401)
curl -s http://localhost:3000/api/auth/me -b cookies.txt | jq
# {"error":"invalid_token","message":"..."}

# Server'ı durdur
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: verify full auth flow with manual smoke tests and migration"
```

---

## Task 13: Dokümantasyon ve Bitirme

**Files:**
- Modify: `README.md`
- Create: `packages/server/README.md`

- [ ] **Step 1: `packages/server/README.md`**

```markdown
# @amongus/server

Among Us klonu backend — Express + Prisma + PostgreSQL.

## Geliştirme

```bash
# .env dosyasını kök dizinde oluştur (bkz. ../../.env.example)
cd packages/server
npm install
npm run db:generate
npm run db:migrate   # ilk kez
npm run dev
```

## Test

```bash
# Test DB gereklidir
createdb amongus_test
DATABASE_URL="postgresql://amongus:amongus_password@localhost:5432/amongus_test?schema=public" npx prisma db push

npm test
```

## API Endpoints

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/health` | ❌ | Health check |
| POST | `/api/auth/register` | ❌ | Yeni kullanıcı kaydı |
| POST | `/api/auth/login` | ❌ | Giriş yap |
| POST | `/api/auth/logout` | ❌ | Çıkış yap (cookie sil) |
| GET | `/api/auth/me` | ✅ | Mevcut kullanıcı bilgisi |

## Prisma Komutları

```bash
npm run db:generate    # Prisma client'ı regenerate et
npm run db:migrate     # Yeni migration uygula
npm run db:push        # Schema'yı direkt push (sadece dev)
```
```

- [ ] **Step 2: Kök `README.md`'yi güncelle — status bölümünü değiştir**

`README.md` dosyasında en sondaki `## Status` bölümünü şununla değiştir:

```markdown
## Status

✅ **Sub-project 1 tamamlandı:** Temel Kurulum + Auth
- Monorepo yapısı (npm workspaces)
- Docker Compose ile tek komut deploy
- Kullanıcı kayıt/giriş (JWT + bcrypt + HttpOnly cookie)
- PostgreSQL + Prisma ORM
- Tam test coverage (password, JWT, route integration)

🚧 Sonraki: Sub-project 2 — Lobi Sistemi (Socket.io ile oda yönetimi)
```

- [ ] **Step 3: Tüm testleri son bir kez çalıştır**

```bash
cd packages/server && npx vitest run
cd ../shared && npx vitest run
```

Expected: tüm testler yeşil.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "docs: complete Sub-project 1 documentation"
git tag sub-project-1-complete
```

---

## Sub-project 1 Tamamlama Kriterleri

- [ ] Monorepo yapısı çalışıyor (`npm install` kökte)
- [ ] `packages/shared` tipleri ve validasyon şemaları test'lerle geçiyor
- [ ] `packages/server` Express app ayağa kalkıyor
- [ ] Kayıt/giriş çalışıyor (bcrypt + JWT + HttpOnly cookie)
- [ ] `/api/auth/me` korumalı endpoint doğrulama yapıyor
- [ ] Tüm testler yeşil (password, jwt, routes, validation)
- [ ] Prisma migration oluşturuldu ve uygulandı
- [ ] `docker compose up` ile sistem ayağa kalkıyor
- [ ] Manuel smoke test (curl) tüm auth akışını doğruladı
