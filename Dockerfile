# ════════════════════════════════════════════════════════════
# CAVOK Glass Cockpit — production Docker image
#
# Multi-stage build:
#   1. deps    — pnpm install with frozen lockfile
#   2. builder — prisma generate + next build (standalone output)
#   3. runner  — minimal image: only the standalone server + static + public
#
# Build:   docker compose build web
# Run:     docker compose up -d
# Update:  docker compose up -d --build
#
# Notes:
#   - The container runs `node server.js` (the file Next.js emits in
#     standalone mode), NOT `next start`. This is faster, smaller, and
#     doesn't need next-cli at runtime.
#   - Migrations are NOT applied automatically — run `corepack pnpm
#     db:migrate` from the host before deploying schema changes. This is
#     intentional: migrations are a manual step so you can review them.
#   - The Prisma generated client at src/generated/prisma is gitignored
#     and generated fresh in the builder stage.
# ════════════════════════════════════════════════════════════

# ─── Stage 1: deps ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma

# Install all deps (including dev) — needed for `next build`. Frozen
# lockfile guarantees reproducibility. The pnpm.supportedArchitectures
# in package.json ensures the musl variant of next-swc is fetched.
RUN pnpm install --frozen-lockfile


# ─── Stage 2: builder ───────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (writes to src/generated/prisma per schema.prisma)
RUN pnpm db:generate

# Build Next.js with standalone output. This produces:
#   .next/standalone/  — self-contained server (server.js, package.json, node_modules subset)
#   .next/static/      — static assets
ENV NODE_ENV=production
RUN pnpm build


# ─── Stage 3: runner ────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy the standalone output. The structure is:
#   /app/server.js              — entrypoint
#   /app/.next/                 — server bundle
#   /app/node_modules/          — minimal runtime deps
#   /app/package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
