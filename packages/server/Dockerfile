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
