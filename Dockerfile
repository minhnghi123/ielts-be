# ─────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests and install deps first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build all apps in the monorepo
ARG SERVICE_NAME=api-gateway
RUN pnpm exec nest build ${SERVICE_NAME}

# ─────────────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy deps + built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

ARG SERVICE_NAME=api-gateway
ENV SERVICE_NAME=${SERVICE_NAME}

EXPOSE 5000

CMD ["sh", "-c", "node dist/apps/${SERVICE_NAME}/main"]
