# Developer Guide

> **Developer-focused documentation** for contributing to the AI-Native Observability Platform

This guide contains technical details, development commands, testing strategies, and architectural information for developers working on the platform.

## 📋 Development Commands

**IMPORTANT**: Always use pnpm commands - never use direct docker/docker-compose/curl commands.

### Core Development Commands

```bash
# Development environment
pnpm dev:up              # Start all services (Docker containers + backend)
pnpm dev:down            # Stop all services
pnpm dev:logs            # View service logs
pnpm dev:reset           # Clean reset (removes volumes and restarts)

# Rebuild services (after code changes)
pnpm dev:rebuild:backend # Rebuild and restart backend service
pnpm dev:rebuild:ui      # Rebuild and restart UI service
pnpm dev:rebuild         # Rebuild all services

# Testing
pnpm test                # Run all unit tests
pnpm test:integration    # Run integration tests
pnpm test:e2e            # Run end-to-end tests
pnpm test:coverage       # Run tests with coverage report

# Code quality
pnpm lint                # Run ESLint
pnpm lint:fix            # Auto-fix linting issues
pnpm format              # Format code with Prettier
pnpm typecheck           # Run TypeScript type checking

# Cleanup
pnpm clean               # Clean build artifacts
pnpm clean:all           # Full cleanup (containers, volumes, artifacts)
pnpm clean:containers    # Remove all containers
pnpm clean:volumes       # Remove all volumes
pnpm clean:prune         # Docker system prune with volumes
pnpm db:truncate         # Clear traces table data

# OpenTelemetry Demo integration
pnpm demo:setup          # Initial demo setup
pnpm demo:up             # Start demo services
pnpm demo:down           # Stop demo services
pnpm demo:logs           # View demo logs
pnpm demo:clean          # Clean demo containers
pnpm demo:status         # Check demo status

# Infrastructure validation
pnpm dev:validate        # Validate environment setup
pnpm dev:validate:traces # Validate trace ingestion
```

### Development Workflows

```bash
# After pulling latest changes
pnpm install             # Install new dependencies
pnpm dev:rebuild:backend # Rebuild backend with changes
pnpm test                # Run tests to verify

# Fresh start (clean everything)
pnpm clean:all           # Remove all containers and data
pnpm dev:up              # Start fresh environment
pnpm demo:setup          # Setup demo if needed
pnpm demo:up             # Start demo services

# Before committing
pnpm lint:fix            # Fix linting issues
pnpm format              # Format code
pnpm typecheck           # Check types
pnpm test                # Run all tests
```

## 🧪 Testing Strategy

### Unit and Integration Tests

```bash
# Unit tests with Vitest
pnpm test                # All unit tests
pnpm test:coverage       # Coverage report
pnpm test:coverage:ui    # Interactive coverage UI
pnpm test:coverage:watch # Watch mode with coverage

# Integration tests (requires Docker services)
pnpm test:integration    # All integration tests
pnpm test:integration:storage      # Storage package only
pnpm test:integration:ai-analyzer  # AI analyzer package only

# Docker-based integration testing
pnpm test:integration:docker  # Run integration tests in Docker container
```

### End-to-End Testing

```bash
# E2E tests with Playwright
pnpm test:e2e          # E2E tests (chromium only)
pnpm test:e2e:all      # All browsers
pnpm test:e2e:ui       # Playwright UI mode
pnpm test:e2e:headed   # Headed mode
pnpm test:e2e:debug    # Debug mode
pnpm test:e2e:quick    # Quick validation tests
```

### Test Organization

**CRITICAL**: All tests MUST be organized in `test/` subdirectories - NEVER scattered `*.test.ts` files:

```text
src/package/
├── test/                    # ALL tests here
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── fixtures/           # Test data
│   └── setup.ts           # Test setup/teardown
├── src/                    # Implementation
└── README.md              # Package documentation
```

## 🏛️ Architecture Overview

### Package Structure

```
otel-ai/
├── src/                    # Source code packages
│   ├── storage/           # ClickHouse + S3 storage layer
│   ├── ai-analyzer/       # Anomaly detection with ML models
│   ├── llm-manager/       # Multi-model LLM orchestration
│   ├── ui-generator/      # Dynamic React components
│   ├── config-manager/    # Self-healing configuration
│   ├── server/           # Backend API server
│   ├── ui/               # Frontend UI components
│   └── build/            # Build and deployment tools
├── migrations/            # Atlas schema migration system
├── docker/               # Container configurations
├── notes/                # Dendron documentation vault
└── scripts/              # Code generation and utilities
```

### Package Documentation Pattern

Each package follows **Option C documentation pattern**:

- **README.md**: Essential package info, getting started, API overview
- **Dendron notes**: Comprehensive specifications and design decisions
- **Auto-linking**: READMEs link to relevant Dendron notes
- **Bidirectional sync**: Keep both in sync, avoid duplication

| Package | README | Comprehensive Docs |
|---------|--------|--------------------|
| [storage](src/storage/) | [📖 README](src/storage/README.md) | [📚 Full Docs](notes/packages/storage/package.md) |
| [ai-analyzer](src/ai-analyzer/) | [📖 README](src/ai-analyzer/README.md) | [📚 Full Docs](notes/packages/ai-analyzer/package.md) |
| [llm-manager](src/llm-manager/) | [📖 README](src/llm-manager/README.md) | [📚 Full Docs](notes/packages/llm-manager/package.md) |
| [ui-generator](src/ui-generator/) | [📖 README](src/ui-generator/README.md) | [📚 Full Docs](notes/packages/ui-generator/package.md) |
| [config-manager](src/config-manager/) | [📖 README](src/config-manager/README.md) | [📚 Full Docs](notes/packages/config-manager/package.md) |
| [server](src/server/) | [📖 README](src/server/README.md) | [📚 Full Docs](notes/packages/server/package.md) |
| [ui](src/ui/) | [📖 README](src/ui/README.md) | [📚 Full Docs](notes/packages/ui/package.md) |
| [build](src/build/) | [📖 README](src/build/README.md) | [📚 Full Docs](notes/packages/build/package.md) |

## 🗄️ Data Architecture

### Unified OTLP Ingestion

**Simplified Architecture**: Single path for all telemetry data

- **Single Path**: All Sources → OTel Collector → Backend Service → `traces` table
- **Simplified Schema**: One optimized table design for all trace data
- **AI-Ready**: Schema optimized for machine learning and analytics

### Schema Migration System

**Production-Ready Atlas Migration Framework**

Container-native schema management with zero external dependencies:

```bash
# Automatic migration on startup
pnpm dev:up              # Runs migrations before services start

# Manual migration commands  
pnpm db:migrate          # Run migrations explicitly
pnpm db:migrate:reset    # Clean slate + migrate
```

**Key Features**:
- **Container-Native**: Self-contained migration container with HTTP-based ClickHouse client
- **Multi-Environment**: Docker Compose + Kubernetes init container patterns
- **Zero Duplication**: Single source of truth eliminates init script redundancy
- **Production Ready**: Health checks, resource limits, retry policies
- **Version Controlled**: Atlas HCL schema definitions with migration history

**Architecture**:
- `migrations/entrypoint.sh`: Multi-mode operation (migrate|init|validate|wait)
- `migrations/schema/`: Centralized schema definitions and views
- `migrations/k8s-job.yaml`: Kubernetes Job and Deployment examples
- HTTP-based connectivity for broad platform compatibility

## 🎯 OpenTelemetry Demo Integration

**"Bring Your Own Backend" Implementation**

Run the official OpenTelemetry demo while sending all telemetry to our AI-native platform:

```bash
# Automated demo management
pnpm demo:setup    # Clone and configure latest demo
pnpm demo:up      # Start demo with our backend
pnpm demo:down    # Stop demo services
pnpm demo:logs    # View demo logs
pnpm demo:clean   # Clean up demo containers
pnpm demo:status  # Check demo service status
pnpm demo:validate # Validate demo integration
```

**Key Features**:
- 🔄 **Automated lifecycle management** with TypeScript script
- 🐳 **Docker Compose overrides** redirect telemetry without forking
- 🚀 **Live telemetry flow** from 15+ demo services to ClickHouse
- 🧹 **Clean integration** - demo source is gitignored

**Demo Services**: Frontend, payment, cart, shipping, product catalog, ad service, and more!

## 🏗️ Infrastructure Management

### Development Environment

```bash
# Development services (ClickHouse, MinIO, OTel Collector)
pnpm dev:up         # Start development services
pnpm dev:down       # Stop development services
pnpm dev:reset      # Reset with clean volumes
pnpm dev:logs       # View service logs

# Development variants
pnpm dev:up:json    # Start with JSON encoding
pnpm dev:up:test    # Start with test data generator
```

### Production Environment

```bash
# Production services
pnpm infra:up       # Start production services
pnpm infra:down     # Stop production services
pnpm infra:reset    # Reset production with clean volumes
pnpm infra:logs     # View production service logs
```

## 🛠️ Development Patterns

### Effect-TS Integration

All data processing layers use Effect-TS for:

- **Schema validation** with runtime safety and compile-time types
- **Structured error handling** with tagged union ADTs
- **Streaming data processing** with backpressure management
- **Resource management** with automatic cleanup
- **Dependency injection** using Context and Layer patterns


## 🧠 AI-Native Development Philosophy

**Documentation-Driven Development + Claude Code Workflows**

1. **Specifications First**: Detailed package specs in [`notes/packages/`](notes/packages/)
2. **AI-Assisted Generation**: Claude Code transforms specs into production code  
3. **Living Documentation**: Bidirectional sync between docs and implementation
4. **Prompt-Driven Operations**: Daily workflows use AI instead of complex bash scripts
5. **Continuous Validation**: Comprehensive tests ensure quality at 2x development pace

**Key Insight**: When building AI-native systems, make the development process itself AI-native.

### Claude Code Agent Workflow

The project uses specialized Claude Code agents for streamlined development workflow:

**Core Development Agents:**
- **code-implementation-planning-agent** - Transform design documents into Effect-TS code with strong typing and tests
- **effect-ts-optimization-agent** - Systematically analyze and optimize Effect-TS patterns, eliminate "as any" usage
- **testing-agent** - Comprehensive test execution and validation
- **code-review-agent** - Quality assurance and best practices validation
- **code-to-docs-sync-agent** - Bidirectional documentation synchronization

**Workflow Management Agents:**
- **start-day-agent** - Daily planning and goal setting
- **end-day-agent** - Progress review and blog generation  
- **pr-creation-agent** - PR creation with screenshot organization

**Feature Development Workflow**:
1. Start day → `start-day-agent` sets goals
2. Feature implementation → `code-implementation-planning-agent` transforms design docs to code
3. Effect-TS optimization → `effect-ts-optimization-agent` ensures clean patterns
4. Testing validation → `testing-agent` comprehensive test execution
5. Code quality review → `code-review-agent` before commits
6. Documentation sync → `code-to-docs-sync-agent` after major changes
7. End day → `end-day-agent` review and content generation

## 🔧 Code Quality Standards

### TypeScript Configuration

- TypeScript with strict mode enabled
- 80% minimum test coverage
- JSDoc comments for all public APIs
- Consistent error handling patterns

### Development Tools

```bash
# Code quality tools
pnpm lint                # ESLint with strict rules
pnpm lint:fix            # Auto-fix linting issues
pnpm format              # Prettier code formatting
pnpm format:check        # Check formatting without changes
pnpm typecheck           # TypeScript type checking
pnpm typecheck:all       # All packages + UI type checking
```

### Git Workflow

**CRITICAL: NEVER commit directly to main branch**

```bash
# Always use feature branches
git checkout -b feat/package-name-feature

# Make changes and commit to feature branch
git add .
git commit -m "feat: implement feature with proper description"

# Push feature branch
git push -u origin feat/package-name-feature

# Create PR via GitHub CLI
gh pr create --title "Feature: Description" --body "..."
```

**Branch naming conventions:**
- `feat/package-feature` - New features
- `fix/issue-description` - Bug fixes
- `docs/section-update` - Documentation updates
- `refactor/component-cleanup` - Code refactoring

## 🤖 Claude Code Agents

The project uses specialized Claude Code agents for streamlined development workflows. These agents automate routine tasks and ensure consistency:

### Available Agents

- **code-implementation-planning-agent** - Transform design documents into Effect-TS code with strong typing and tests
- **effect-ts-optimization-agent** - Systematically analyze and optimize Effect-TS patterns, eliminate "as any" usage
- **testing-agent** - Comprehensive test execution and validation
- **code-review-agent** - Quality assurance and best practices validation
- **code-to-docs-sync-agent** - Bidirectional documentation synchronization
- **pr-creation-agent** - PR creation with screenshot organization

### Agent Usage Examples

#### Feature Implementation from Design
```
Use the code-implementation-planning-agent when you have a design document or specification and need to implement production-ready code with Effect-TS patterns, strong typing, and comprehensive tests.
```

#### Effect-TS Optimization
```
Use the effect-ts-optimization-agent to systematically analyze and optimize Effect-TS patterns, eliminate "as any" usage, and ensure comprehensive validation before declaring success.
```

#### Comprehensive Testing
```
Use the testing-agent to validate infrastructure, execute test suites, and report detailed results with proper error handling.
```

#### Code Quality Review
```
Use the code-review-agent to review for quality, conventions, and best practices before committing changes.
```

## 🐛 Debugging

### Service Logs

```bash
# View logs for specific services
pnpm dev:logs                    # All service logs
docker logs otel-ai-clickhouse  # ClickHouse logs
docker logs otel-ai-backend     # Backend service logs
docker logs otel-ai-collector   # OTel Collector logs
```

### Database Access

```bash
# Direct ClickHouse access
docker exec -it otel-ai-clickhouse clickhouse-client --user=otel --password=otel123 --database=otel

# Common queries
SELECT COUNT(*) FROM traces;
SELECT service_name, COUNT(*) FROM traces GROUP BY service_name;
```

### Common Issues

#### Port Conflicts
```bash
# Check for port conflicts before starting
pnpm dev:validate
```

#### Clean Reset
```bash
# Nuclear option - clean everything and restart
pnpm clean:all
pnpm dev:up
```

#### Test Database Issues
```bash
# Reset test environment
pnpm db:truncate
pnpm test:integration
```

## 📊 Monitoring and Observability

### Platform Self-Monitoring

The platform instruments itself with OpenTelemetry:

- Backend service traces sent to local ClickHouse
- LLM operation traces with token usage metrics
- Database operation traces with performance metrics
- UI interaction traces for user experience monitoring

### Metrics Collection

- Request latency and throughput metrics
- Error rates and types
- Resource utilization (CPU, memory)
- Custom business metrics

## 🤝 Contributing Guidelines

### Code Style

- Follow TypeScript strict mode conventions
- Use Effect-TS patterns for data processing
- Implement comprehensive error handling
- Add JSDoc comments for public APIs
- Follow semantic commit message format

### Testing Requirements

- Unit tests for all business logic
- Integration tests for external dependencies
- E2E tests for critical user paths
- Minimum 80% code coverage
- TestContainers for database testing

### Documentation Requirements

- Update both README.md and Dendron notes
- Include API examples in documentation
- Document breaking changes in commit messages
- Update architecture diagrams when needed

### Pull Request Process

1. Create feature branch from main
2. Implement changes with tests
3. Run full test suite (`pnpm ci`)
4. Update documentation
5. Create PR with detailed description
6. Address review feedback
7. Squash and merge to main

---

**🤖 Built with [Claude Code](https://claude.ai/code) | 📈 Tracking 2x expected development velocity**