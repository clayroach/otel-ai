# UI Dockerfile for production deployment
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (avoid frozen-lockfile due to electron version mismatch)
# Use --no-frozen-lockfile explicitly to allow lockfile updates
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY . .

# Build the web application only
RUN pnpm build:web

# Production stage
FROM nginx:alpine AS production

# Copy built assets to nginx
COPY --from=base /app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
COPY docker/nginx.conf /etc/nginx/nginx.conf

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

# Start development server with host binding
CMD ["pnpm", "dev:web", "--host", "0.0.0.0"]