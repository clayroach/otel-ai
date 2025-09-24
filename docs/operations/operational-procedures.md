---
id: packages.operational-procedures
title: Operational Procedures
desc: 'Complete build, run, test, and deploy procedures for all packages'
updated: 2025-08-20
created: 2025-08-20
---

# Operational Procedures

## Overview

This document provides comprehensive operational procedures for building, running, testing, and deploying the otel-ai platform. All procedures use pnpm as the package manager and follow the scripts defined in package.json.

## Package.json Scripts Reference

### Development Workflow

```bash
# Start development environment
pnpm dev:up              # Start infrastructure (ClickHouse, OTel Collector)
pnpm dev                 # Start TypeScript watch mode for backend
pnpm demo:up             # Start OpenTelemetry demo for test data

# Development with test data
pnpm dev:up:test         # Start dev environment with test data generation
pnpm dev:logs:test       # View logs for dev environment with test data
```

### Build Procedures

```bash
# Code generation (run before building)
pnpm proto:generate      # Generate protobuf TypeScript types
pnpm generate           # Generate code from specifications (storage, etc.)

# Build process
pnpm build              # Build entire project (protobuf + TypeScript)
pnpm clean              # Clean build artifacts

# Protobuf specific
pnpm proto:clean        # Clean generated protobuf files
pnpm proto:rebuild      # Clean and regenerate protobuf files
pnpm proto:lint         # Lint protobuf definitions
pnpm proto:format       # Format protobuf definitions
```

### Testing Procedures

```bash
# Core testing
pnpm test               # Run all tests (unit + integration)
pnpm test:coverage      # Run tests with coverage report
pnpm test:integration   # Run integration tests only

# Package-specific testing
pnpm test:integration:storage  # Run storage integration tests only

# Quality assurance
pnpm lint               # ESLint code checking
pnpm lint:fix           # Auto-fix linting issues
pnpm format             # Format code with Prettier
pnpm format:check       # Check code formatting
pnpm typecheck          # TypeScript type checking
```

### Infrastructure Management

```bash
# Production infrastructure
pnpm infra:up           # Start production infrastructure
pnpm infra:down         # Stop production infrastructure
pnpm infra:logs         # View production infrastructure logs
pnpm infra:reset        # Reset production infrastructure (delete volumes)

# Database operations
pnpm db:migrate         # Run database migrations
pnpm db:migrate:build   # Build schema migrator container
pnpm db:migrate:reset   # Reset database and run migrations
```

### OpenTelemetry Demo Integration

```bash
# Demo management
pnpm demo:clone         # Clone OpenTelemetry demo repository
pnpm demo:setup         # Set up demo environment
pnpm demo:up            # Start demo services
pnpm demo:down          # Stop demo services
pnpm demo:logs          # View demo logs
pnpm demo:clean         # Clean demo environment
pnpm demo:status        # Check demo status
pnpm demo:validate      # Validate demo integration
```

### Combined Workflows

```bash
# Complete setup
pnpm setup              # dev:up + install (complete development setup)

# CI/CD workflow
pnpm ci                 # format:check + lint + typecheck + test
pnpm release            # ci + build (full release workflow)
```

## Detailed Procedures

### Complete Development Setup

1. **Initial Setup**
   ```bash
   # Clone repository
   git clone https://github.com/clayroach/otel-ai.git
   cd otel-ai
   
   # Install dependencies
   pnpm install
   
   # Start infrastructure and development
   pnpm setup
   ```

2. **Generate Code Dependencies**
   ```bash
   # Generate protobuf types
   pnpm proto:generate
   
   # Generate package implementations from specs
   pnpm generate
   ```

3. **Start Development Services**
   ```bash
   # Start development environment
   pnpm dev:up
   
   # Start backend in watch mode
   pnpm dev
   
   # Start UI application (in separate terminal)
   cd ui && pnpm dev
   ```

### Testing Procedures

#### Unit Testing
```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode for development
pnpm test --watch
```

#### Integration Testing
```bash
# Run all integration tests
pnpm test:integration

# Storage-specific integration tests
pnpm test:integration:storage

# Manual infrastructure validation
node test/validate-infrastructure.js
```

#### End-to-End Testing
```bash
# Start demo for E2E testing
pnpm demo:up

# Validate demo integration
pnpm demo:validate

# Check trace ingestion
curl -s http://localhost:4319/api/traces | jq '.'
```

### Build and Release Procedures

#### Development Build
```bash
# Clean previous build
pnpm clean

# Generate dependencies
pnpm proto:generate

# Build TypeScript
pnpm build

# Verify build
node dist/index.js --help
```

#### Production Build
```bash
# Full CI workflow
pnpm ci

# Production build
pnpm release

# Docker build (if using containers)
docker build -t otel-ai:latest .
```

### Deployment Procedures

#### Local Development Deployment
```bash
# Start infrastructure
pnpm infra:up

# Run database migrations
pnpm db:migrate

# Start application
pnpm start
```

#### Production Deployment
```bash
# Production infrastructure
pnpm infra:up

# Database setup
pnpm db:migrate

# Application deployment
NODE_ENV=production pnpm start
```

#### UI Deployment
```bash
# Web deployment
cd ui
pnpm build:web
# Deploy dist/ to web server

# Electron desktop app
cd ui
pnpm build:electron
# Package in release/ directory
```

### Monitoring and Maintenance

#### Health Checks
```bash
# Backend health
curl http://localhost:4319/health

# ClickHouse health
docker exec otel-ai-clickhouse-1 clickhouse-client --query "SELECT 1"

# Demo services health
pnpm demo:status
```

#### Log Monitoring
```bash
# Infrastructure logs
pnpm infra:logs

# Development logs
pnpm dev:logs

# Demo logs
pnpm demo:logs
```

#### Database Maintenance
```bash
# Reset development database
pnpm db:migrate:reset

# Backup production data
# (Add specific backup procedures based on deployment)

# Monitor database performance
# (Add ClickHouse monitoring queries)
```

## Environment Configuration

### Required Environment Variables

```bash
# ClickHouse Configuration
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=otel
CLICKHOUSE_USERNAME=otel
CLICKHOUSE_PASSWORD=otel123

# Application Configuration
PORT=4319
NODE_ENV=development

# Optional: S3/MinIO Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=otel-data
```

### Development Configuration Files

- **package.json**: Main script definitions and dependencies
- **tsconfig.json**: TypeScript compilation configuration
- **vitest.config.ts**: Unit test configuration
- **vitest.integration.config.ts**: Integration test configuration
- **docker-compose.yml**: Infrastructure service definitions
- **.env**: Environment variable overrides (create as needed)

## Troubleshooting

### Common Issues

1. **Protobuf Generation Fails**
   ```bash
   # Clean and regenerate
   pnpm proto:clean
   pnpm proto:generate
   ```

2. **Tests Fail with Database Connection**
   ```bash
   # Ensure infrastructure is running
   pnpm dev:up
   
   # Check ClickHouse status
   docker ps | grep clickhouse
   ```

3. **Build Fails with TypeScript Errors**
   ```bash
   # Check types
   pnpm typecheck
   
   # Generate missing code
   pnpm generate
   ```

4. **Demo Integration Issues**
   ```bash
   # Validate demo setup
   pnpm demo:validate
   
   # Check demo logs
   pnpm demo:logs
   ```

### Performance Optimization

1. **ClickHouse Query Performance**
   - Monitor query execution times in UI
   - Use EXPLAIN for complex queries
   - Consider table partitioning for large datasets

2. **Application Performance**
   - Monitor memory usage during development
   - Profile TypeScript compilation times
   - Optimize Docker container resource usage

## Best Practices

### Development Workflow
1. Always run `pnpm proto:generate` after protobuf changes
2. Use `pnpm ci` before committing to ensure quality
3. Test both JSON and Protobuf OTLP ingestion paths
4. Validate UI changes with real trace data from demo

### Testing Strategy
1. Run integration tests in CI/CD pipeline
2. Use TestContainers for isolated testing
3. Validate both positive and negative test cases
4. Monitor test execution performance

### Deployment Safety
1. Always run `pnpm db:migrate` before application deployment
2. Validate health endpoints after deployment
3. Monitor logs during initial deployment
4. Keep previous version available for rollback

This operational documentation ensures all team members can effectively build, test, and deploy the otel-ai platform following consistent procedures.