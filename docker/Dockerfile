# ============================================================================
# PROD Dockerfile — multi-stage: after build, keep only dist + prod deps (slim image)
# Build context = project root (see docker-compose.prod.yml / .gitlab-ci.yml)
# ============================================================================

# ---- Stage 1: build (needs devDependencies too: nest cli, typescript) -------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: production runtime (prod deps + dist only) --------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
