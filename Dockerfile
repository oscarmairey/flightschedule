# ════════════════════════════════════════════════════════════
# FlightSchedule — production Docker image
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

RUN apk add --no-cache openssl libc6-compat icu-data-full
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma

# The host package.json sets pnpm.supportedArchitectures to fetch BOTH
# glibc and musl variants of next-swc/sharp/esbuild so the host's
# `pnpm install` (Ubuntu, glibc) also pulls musl for the container.
# Inside this Alpine stage we only ever need musl — keeping the override
# would double the install size (~250 MB of duplicated next-swc alone)
# and bloat every subsequent COPY between stages. Strip it before install.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));if(p.pnpm)delete p.pnpm.supportedArchitectures;fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

# Install all deps (including dev) — needed for `next build`. Frozen
# lockfile guarantees reproducibility. The cache mount persists pnpm's
# content-addressable store across builds so warm builds skip the
# download/extract entirely.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile


# ─── Stage 2: builder ───────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat icu-data-full
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (writes to src/generated/prisma per schema.prisma)
RUN pnpm db:generate

# NEXT_PUBLIC_* must be present at BUILD time — Next.js inlines them into
# the client JavaScript bundle during `next build`. They cannot be
# overridden at runtime. docker-compose's `env_file: .env` only injects
# vars into the runtime container, so these have to come in as build
# ARGs. See docker-compose.yml `web.build.args`.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build Next.js with standalone output. This produces:
#   .next/standalone/  — self-contained server (server.js, package.json, node_modules subset)
#   .next/static/      — static assets
ENV NODE_ENV=production
RUN pnpm build


# ─── Stage 3: runner ────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat icu-data-full

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
