# Deployment Package

Bazel build system with single-command deployment for the entire AI-native observability platform.

## Quick Start

```bash
# Build everything
bazel build //...

# Deploy to local development
pnpm deploy:dev

# Deploy to production
pnpm deploy:prod
```

## Key Features

- **Bazel Build System**: Reproducible, incremental builds with dependency caching
- **Single-Command Deployment**: Deploy entire platform with one command
- **Multi-Environment Support**: Dev, staging, production configurations
- **Container Orchestration**: Docker Compose and Kubernetes support
- **Effect-TS Integration**: Type-safe deployment pipelines with structured error handling

## Installation

```bash
# Install Bazel (macOS)
brew install bazel

# Install dependencies
pnpm install
```

## Basic Usage

```bash
# Development deployment
pnpm dev:up                 # Start all services locally
pnpm dev:down               # Stop all services

# Production deployment
pnpm deploy:prod            # Deploy to production environment
pnpm deploy:staging         # Deploy to staging environment

# Build operations
bazel build //src/...       # Build all packages
bazel test //src/...        # Run all tests
```

## Deployment Targets

- **Local Development**: Docker Compose with hot reload
- **Staging**: Kubernetes cluster with production-like setup
- **Production**: Multi-region Kubernetes deployment with monitoring

## Documentation

For comprehensive documentation, deployment strategies, and infrastructure setup, see:

📖 **[Deployment Package Documentation](../../notes/packages/deployment/package.md)**

## Infrastructure Components

- ClickHouse cluster for telemetry storage
- S3-compatible object storage
- OpenTelemetry Collector
- AI model inference services
- Frontend application (React + Vite)

## Testing

```bash
# Unit tests
pnpm test:unit

# Integration tests (full deployment)
pnpm test:integration

# Infrastructure validation
node test/validate-infrastructure.js
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for development workflow and deployment patterns.

## Environment Configuration

```bash
# Development
cp .env.example .env.development

# Production
cp .env.example .env.production
# Configure production values
```