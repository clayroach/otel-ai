# UI Dockerfile for production deployment
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace root files (needed for pnpm workspace)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/package.json ./ui/

# Install dependencies (avoid frozen-lockfile due to electron version mismatch)
# Use --no-frozen-lockfile explicitly to allow lockfile updates
RUN pnpm install --no-frozen-lockfile

# Copy UI source code
COPY ui/ ./ui/

# Build the web application only
RUN cd ui && pnpm build:web

# Production stage
FROM nginx:alpine AS production

# Copy built assets to nginx (from workspace ui subdirectory)
COPY --from=base /app/ui/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing (from ui directory)
COPY ui/docker/nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Development stage (for docker-compose)
FROM base AS development

# Install development dependencies (avoid frozen-lockfile due to electron version mismatch)  
# Use --no-frozen-lockfile explicitly to allow lockfile updates
RUN pnpm install --no-frozen-lockfile

# Expose Vite dev server port
EXPOSE 5173

# Start development server with host binding (from ui directory)
WORKDIR /app/ui
CMD ["pnpm", "dev:web", "--host", "0.0.0.0"]