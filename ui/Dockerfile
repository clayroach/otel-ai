# UI Dockerfile for production deployment
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory for workspace
WORKDIR /workspace

# Copy workspace root package files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy UI package files
COPY ui/package.json ui/pnpm-lock.yaml ./ui/

# Install dependencies with workspace context (fix lockfile mismatch)
RUN pnpm install --no-frozen-lockfile

# Set working directory to ui and copy source code
WORKDIR /workspace/ui
COPY ui/ .

# Build the web application only
RUN pnpm build:web

# Production stage
FROM nginx:alpine AS production

# Copy built assets to nginx
COPY --from=base /workspace/ui/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Development stage (for docker-compose)
FROM base AS development

# Expose Vite dev server port
EXPOSE 5173

# Start development server with host binding
CMD ["pnpm", "dev:web", "--host", "0.0.0.0"]