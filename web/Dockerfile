# syntax=docker/dockerfile:1
#
# Next.js 16 app — multi-stage.
#   target: dev     -> `next dev` with the source bind-mounted (compose override)
#   target: runner  -> minimal production image from `output: "standalone"`
#
# Build the production image with the public Supabase vars as build args — they
# are inlined into the client bundle at `next build` time:
#   docker build --target runner \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... web/

ARG NODE_IMAGE=node:22-bookworm-slim

# --- base ------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- deps: install node_modules from the lockfile ------------------------
FROM base AS deps
# Prisma's postinstall runs `prisma generate`, which needs the schema present.
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Placeholder — `prisma generate` only reads the schema, never connects. The
# real value is injected at runtime by compose (env_file: web/.env).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm ci

# --- dev: hot-reloading server (docker-compose.override.yml) ------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- builder: produce the standalone build ----------------------------
FROM base AS builder
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# lib/gemini/client.ts throws at import time if this is unset, which crashes
# `next build` while it collects route data for /api/chat/classify. Build-only
# placeholder — a real (non-public) key is injected at runtime via env_file.
ENV GEMINI_API_KEY="build-placeholder-gemini-key"
# NEXT_PUBLIC_* are compiled into the browser bundle here and cannot be
# changed at runtime — they must be supplied now.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
# Which chat backend the browser talks to (/api/chat-sql = direct SQL method).
# Left unset they default to /api/chat and demo mode off.
ARG NEXT_PUBLIC_CHAT_ENDPOINT
ARG NEXT_PUBLIC_CHAT_MOCK
ENV NEXT_PUBLIC_CHAT_ENDPOINT=${NEXT_PUBLIC_CHAT_ENDPOINT}
ENV NEXT_PUBLIC_CHAT_MOCK=${NEXT_PUBLIC_CHAT_MOCK}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal production image --------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The Prisma query engine is a native binary; output tracing is unreliable
# about copying it, so bring it in explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
