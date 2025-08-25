# Integration Test Runner Dockerfile
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev for testing)
RUN pnpm install --frozen-lockfile

# Copy source code and test files
COPY src/ ./src/
COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY vitest.integration.config.ts ./

# Set environment for integration tests
ENV NODE_ENV=test
ENV API_URL=http://backend:4319

# Run integration tests
CMD ["pnpm", "test:integration:ai-analyzer"]