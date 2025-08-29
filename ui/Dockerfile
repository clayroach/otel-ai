# UI Dockerfile for production and development

# Development stage - minimal setup for mounting local files
FROM node:18-alpine AS development

# Install debug tools
RUN apk add --no-cache curl wget netcat-openbsd jq bash

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Configure pnpm to use a store directory outside the mounted volume
# This prevents .pnpm-store from being created in the host directory
RUN pnpm config set store-dir /tmp/pnpm-store

# Expose Vite dev server port
EXPOSE 5173

# The actual source files and package.json will be mounted via docker-compose
# Start development server with host binding
CMD ["sh", "-c", "pnpm install && pnpm dev:web --host 0.0.0.0"]

# Production build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY ui/package.json ui/pnpm-lock.yaml ./

# Install dependencies (including devDependencies needed for build)
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY ui/ .

# Build the web application
RUN pnpm build:web

# Production stage
FROM nginx:alpine AS production

# Install debug tools
RUN apk add --no-cache curl wget netcat-openbsd jq bash

# Copy built assets to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]