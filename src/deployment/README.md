# Deployment Package

⚠️ **NOT IMPLEMENTED** - This package is currently a specification-only placeholder.

Container orchestration and deployment automation for the AI-native observability platform. Will provide Docker Compose and Kubernetes deployment configurations when implemented.

## Current Status

📋 **Specification Only** - No implementation code exists yet. This package contains only this README file.

Note: The actual deployment is currently handled by Docker Compose files in the project root and npm scripts in package.json.

## Current Deployment (Handled Outside This Package)

```bash
# These commands work but are defined in root package.json, not this package
pnpm dev:up         # Start development environment
pnpm dev:down       # Stop development environment
pnpm demo:up        # Start OpenTelemetry demo
pnpm demo:down      # Stop demo
```

## Planned Features

When implemented, this package will provide:

- **Bazel Build System**: Reproducible builds with dependency management
- **Docker Compose Orchestration**: Multi-service container deployment
- **Kubernetes Manifests**: Production-ready K8s deployment configs
- **Helm Charts**: Templated Kubernetes deployments
- **CI/CD Pipelines**: GitHub Actions and GitLab CI configurations
- **Infrastructure as Code**: Terraform/Pulumi definitions
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
pnpm test

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