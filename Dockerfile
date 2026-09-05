# syntax=docker/dockerfile:1

# ─── Stage 1: Build Frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ─── Stage 2: Build Backend ───────────────────────────────────────────────────
FROM golang:1.26-alpine AS backend-builder

WORKDIR /app

COPY go-server/go.mod go-server/go.sum ./
RUN go mod download

COPY go-server/ ./
COPY --from=frontend-builder /app/dist ./web/dist

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o mylight .

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && addgroup -S mylight && adduser -S -G mylight mylight

WORKDIR /app

# Copy compiled backend
COPY --from=backend-builder /app/mylight ./mylight

# Data directory for SQLite db and uploads (mount as volume)
RUN mkdir -p /data/uploads /var/lib/mylight-tailscale && chown -R mylight:mylight /data /app /var/lib/mylight-tailscale

EXPOSE 3000

ENV PORT=3000 \
    DATA_DIR=/data \
    TZ=America/New_York

USER mylight

CMD ["./mylight"]
