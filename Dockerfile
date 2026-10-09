# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for sharp
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Время сборки образа (UTC) — отдаётся в GET /health как builtAt
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /app/BUILT_AT

# Use non-root user (exists in node:20-alpine)
USER node

EXPOSE 3000

CMD ["node", "dist/back/main.js"]