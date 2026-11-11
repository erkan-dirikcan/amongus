# Multi-stage production build for Coolify / Docker

FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN npm install --ignore-scripts && npm rebuild bcrypt && npx prisma generate --schema packages/server/prisma/schema.prisma || true

# Copy full workspace source
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Generate Prisma Client & build frontend bundle
RUN npm run db:generate --workspace @amongus/server
RUN npm run build --workspace @amongus/client

# --- Production Runner Stage ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/client/package.json ./packages/client/package.json
COPY --from=builder /app/packages/client/dist ./packages/client/dist

EXPOSE 3000

# Apply Prisma migrations and launch the server
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/server/prisma/schema.prisma && npx tsx packages/server/src/index.ts"]
