# AI-Native Observability Platform

> **30-Day Challenge**: Building enterprise-grade observability with AI at the core using Claude Code and documentation-driven development

An OpenTelemetry-based observability platform where machine learning is integrated from the ground up - not bolted on as an afterthought. Features real-time anomaly detection, LLM-generated dashboards, and intelligent system insights that adapt to your team's needs.

## 🏆 **Project Status**

An AI-native observability platform with unified OTLP ingestion and OpenTelemetry Demo integration.

> 📊 **Daily Progress**: Follow the journey in [`notes/daily/`](notes/daily/) | **Blog Series**: [Dev.to Series](blog/platforms/)

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, pnpm, Docker

```bash
# 1. Clone and setup
git clone https://github.com/clayroach/otel-ai.git
cd otel-ai

# 2. Install dependencies
pnpm install

# 3. Start developing
pnpm dev:up        # Start platform services (Docker)
pnpm dev          # Start development server

# 4. Try the OpenTelemetry Demo integration
pnpm demo:up      # Start demo with your platform as backend
```

## 🏗️ **Unified OTLP Ingestion** ✅

**Simplified Architecture**: Single path for all telemetry data

- **Single Path**: All Sources → OTel Collector → Backend Service → `traces` table
- **Simplified Schema**: One optimized table design for all trace data
- **AI-Ready**: Schema optimized for machine learning and analytics
- **Professional UI**: Monaco SQL editor with unified data access

**Tech Stack**:
- **ClickHouse**: Real-time analytics with unified schema
- **React + Monaco**: Professional SQL interface with syntax highlighting  
- **Effect-TS**: Type-safe functional programming patterns
- **TestContainers**: Real database integration testing

## 🗄️ **Schema Migration System** ✅

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

## 🎯 **OpenTelemetry Demo Integration**

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

## 📦 Development Workflow

### Package Documentation

Each package includes comprehensive documentation following our **Option C pattern**:

- **README.md**: Quick start, API overview, basic examples
- **Dendron notes**: Full specifications, architecture, design decisions

| Package | README | Comprehensive Docs |
|---------|--------|--------------------|
| [storage](src/storage/) | [📖 README](src/storage/README.md) | [📚 Full Docs](notes/packages/storage/package.md) |
| [ai-analyzer](src/ai-analyzer/) | [📖 README](src/ai-analyzer/README.md) | [📚 Full Docs](notes/packages/ai-analyzer/package.md) |
| [llm-manager](src/llm-manager/) | [📖 README](src/llm-manager/README.md) | [📚 Full Docs](notes/packages/llm-manager/package.md) |
| [ui-generator](src/ui-generator/) | [📖 README](src/ui-generator/README.md) | [📚 Full Docs](notes/packages/ui-generator/package.md) |
| [config-manager](src/config-manager/) | [📖 README](src/config-manager/README.md) | [📚 Full Docs](notes/packages/config-manager/package.md) |
| [deployment](src/deployment/) | [📖 README](src/deployment/README.md) | [📚 Full Docs](notes/packages/deployment/package.md) |

### Development Commands

```bash
# Development workflow
pnpm install        # Install dependencies
pnpm dev:up        # Start infrastructure (Docker)
pnpm dev           # Start development server
pnpm test          # Run unit tests
pnpm test:integration  # Run integration tests
pnpm test:e2e      # Run E2E tests with Playwright
pnpm typecheck     # TypeScript validation
```

### Infrastructure Management

```bash
# Infrastructure control
pnpm dev:up         # Start development services (ClickHouse, MinIO, OTel Collector)
pnpm dev:down       # Stop development services
pnpm dev:reset      # Reset with clean volumes
pnpm dev:logs       # View service logs

# Production infrastructure
pnpm infra:up       # Start production services
pnpm infra:down     # Stop production services
pnpm infra:reset    # Reset production with clean volumes
pnpm infra:logs     # View production service logs
```

## 🧪 Testing

```bash
# Unit and integration tests
pnpm test              # Unit tests with Vitest
pnpm test:coverage     # Coverage report
pnpm test:integration  # Integration tests (requires Docker services)

# End-to-end testing
pnpm test:e2e          # E2E tests with Playwright
pnpm test:e2e:ui       # E2E tests with Playwright UI
pnpm test:e2e:headed   # E2E tests in headed mode
pnpm test:e2e:debug    # Debug E2E tests
pnpm test:e2e:quick    # Quick validation tests

# Docker-based integration testing
pnpm test:integration:docker  # Run integration tests in Docker container
```

## ✅ **Current Features**

### Core Platform
- **Dual-ingestion architecture** with unified trace view
- **Professional Monaco SQL interface** with ClickHouse syntax highlighting
- **Comprehensive test suite** (42 tests with TestContainers integration)
- **Production Docker environment** with full observability stack
- **OpenTelemetry Demo integration** using "Bring Your Own Backend" approach

### Data Processing
- **ClickHouse storage** with real-time analytics and dual-schema support
- **Effect-TS patterns** for type-safe functional programming
- **OTLP native ingestion** through OpenTelemetry Collector
- **Direct API ingestion** for AI-optimized data processing

### Development Experience
- **AI-native workflows** with Claude Code integration
- **Documentation-driven development** with living specifications
- **TestContainers testing** against real databases
- **TypeScript automation** for complex workflow management

## 🏛️ Project Structure

```
otel-ai/
├── src/                    # Source code packages
│   ├── storage/           # ClickHouse + S3 storage layer [📖 README](src/storage/README.md)
│   ├── ai-analyzer/       # Anomaly detection with ML models [📖 README](src/ai-analyzer/README.md)
│   ├── llm-manager/       # Multi-model LLM orchestration [📖 README](src/llm-manager/README.md)
│   ├── ui-generator/      # Dynamic React components [📖 README](src/ui-generator/README.md)
│   ├── config-manager/    # Self-healing configuration [📖 README](src/config-manager/README.md)
│   └── deployment/        # Bazel build + deployment [📖 README](src/deployment/README.md)
├── migrations/            # Atlas schema migration system
│   ├── entrypoint.sh     # Container-native migration entrypoint
│   ├── schema/          # HCL schema definitions and views
│   ├── clickhouse/      # SQL migration files
│   └── k8s-job.yaml     # Kubernetes deployment examples
├── docker/                # Container configurations
│   ├── clickhouse/       # ClickHouse configuration
│   ├── otel-collector/   # OpenTelemetry Collector config
│   └── envoy/           # Load balancer config
├── notes/                 # Dendron documentation vault
│   ├── daily/           # Development journal
│   ├── packages/        # Package specifications
│   └── design/         # Architecture decisions
└── scripts/              # Code generation and utilities
```

## 🔧 **AI-Native Development Philosophy**

**Documentation-Driven Development + Claude Code Workflows**

1. **Specifications First**: Detailed package specs in [`notes/packages/`](notes/packages/)
2. **AI-Assisted Generation**: Claude Code transforms specs into production code  
3. **Living Documentation**: Bidirectional sync between docs and implementation
4. **Prompt-Driven Operations**: Daily workflows use AI instead of complex bash scripts
5. **Continuous Validation**: 42 tests ensure quality at 2x development pace

**Key Insight**: When building AI-native systems, make the development process itself AI-native.

> 📖 **Philosophy Deep Dive**: Read the full approach in [`notes/inception.md`](notes/inception.md)

## 📈 AI Features (Roadmap)

### Real-time Anomaly Detection

- Autoencoder neural networks trained on telemetry patterns
- Automatic baseline learning and drift detection
- Multi-dimensional anomaly scoring

### LLM-Generated Dashboards

- Dynamic React components based on user queries
- Role-based dashboard personalization
- Natural language to visualization

### Multi-Model AI Orchestration

- GPT-4 for complex reasoning
- Claude for code generation
- Local Llama for privacy-sensitive operations
- Intelligent model routing based on task requirements

## 🚢 Deployment

```bash
# Production build
pnpm release

# Container deployment
pnpm docker:build
docker-compose -f docker-compose.prod.yaml up -d
```

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🚀 **Why This Matters**

This project proves that **AI-assisted development can compress traditional enterprise software timelines by 10x or more**. 

- **Traditional approach**: 10+ developers, 12+ months
- **AI-native approach**: 1 developer + Claude Code, 30 days (potentially 20-25 days at current pace)

**Key Success Factors**:
- Documentation-driven development provides clear AI context
- Professional UI early enables faster debugging cycles  
- Comprehensive testing prevents rework and technical debt
- AI-native workflows eliminate traditional development overhead

## 📚 **Follow the Journey**

- **📊 Daily Progress**: [`notes/daily/`](notes/daily/) - Detailed development journal
- **📝 Blog Series**: [`blog/platforms/`](blog/platforms/) - Dev.to articles with insights
- **🏗️ Architecture**: [`notes/design.md`](notes/design.md) - Technical decisions
- **📦 Packages**: [`notes/packages/`](notes/packages/) - Detailed specifications

## 🤝 **Contributing**

This is a 30-day challenge project demonstrating AI-assisted development. While the primary goal is timeline compression research, contributions and feedback are welcome!

**Current Focus**: Week 2 advanced UI features - see [`notes/daily/`](notes/daily/) for immediate goals.

---

**🤖 Built with [Claude Code](https://claude.ai/code) | 📈 Tracking 2x expected development velocity**
