# ============================================================================
# Dockerfile PROD — multi-stage: build xong chỉ giữ dist + prod deps (image gọn)
# Build context = thư mục gốc project (xem docker-compose.prod.yml / .gitlab-ci.yml)
# ============================================================================

# ---- Stage 1: build (cần cả devDependencies: nest cli, typescript) ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: production runtime (chỉ prod deps + dist) ---------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
