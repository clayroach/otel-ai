# AI-Native Observability Platform Backend
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (use --ignore-scripts to avoid node-gyp issues, --no-frozen-lockfile to allow updates)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Copy source code and protobuf definitions
COPY src/ ./src/
COPY protobuf/ ./protobuf/
COPY tsconfig.json ./
COPY buf.gen.yaml ./
COPY .eslintrc.json ./

# Build stage
FROM base AS builder
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install debug tools
RUN apk add --no-cache curl wget netcat-openbsd jq bash

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only (skip prepare scripts and avoid node-gyp issues, allow lockfile updates)
RUN pnpm install --no-frozen-lockfile --prod --ignore-scripts

# Copy built application and protobuf definitions
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/protobuf ./protobuf

# Set environment variables
ENV NODE_ENV=production
ENV CLICKHOUSE_HOST=clickhouse
ENV CLICKHOUSE_PORT=8123
ENV CLICKHOUSE_DATABASE=otel
ENV CLICKHOUSE_USERNAME=otel
ENV CLICKHOUSE_PASSWORD=otel123

# Expose port for OTLP ingestion
EXPOSE 4319

# Start the backend (TypeScript builds to dist/)
CMD ["node", "dist/index.js"]