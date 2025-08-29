# Test Data Generator Dockerfile
FROM node:18-alpine

# Install debug tools
RUN apk add --no-cache curl wget netcat-openbsd jq bash

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN pnpm install

# Copy generator script
COPY generate-test-data.js ./

# Run the generator
CMD ["node", "generate-test-data.js"]