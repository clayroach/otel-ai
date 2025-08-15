# Test Data Generator Dockerfile
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY docker/test-data/package.json ./
RUN pnpm install

# Copy generator script
COPY docker/test-data/generate-test-data.js ./

# Run the generator
CMD ["node", "generate-test-data.js"]