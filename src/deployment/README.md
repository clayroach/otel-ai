# Deployment Package

Container orchestration and deployment automation for the AI-native observability platform using Docker Compose and Kubernetes.

## Quick Start

```bash
# Deploy to local development
pnpm dev:up

# Deploy to production infrastructure
pnpm infra:up

# Deploy with specific profiles
pnpm dev:up:json    # JSON encoding variant
```

## Key Features

- **Docker Compose Orchestration**: Multi-service container deployment
- **Environment Profiles**: Dev, staging, production configurations  
- **Kubernetes Ready**: Production-ready container definitions
- **Health Monitoring**: Automated service health validation
- **Effect-TS Integration**: Type-safe deployment pipelines with structured error handling

## Installation

```bash
# Install dependencies
pnpm install

# Ensure Docker is running
docker --version
```

## Basic Usage

```bash
# Development deployment  
pnpm dev:up                 # Start all services locally
pnpm dev:down               # Stop all services
pnpm dev:logs               # View service logs

# Production deployment
pnpm infra:up               # Deploy production infrastructure
pnpm infra:down             # Stop production services
pnpm infra:reset            # Reset with clean volumes

# Build operations handled by build package
pnpm build                  # TypeScript compilation
pnpm test:integration       # Test deployment
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