# AI-Native Observability Platform

> Built in 30 days using documentation-driven development and Claude Code

An OpenTelemetry-based observability platform where AI is integrated at the core for real-time anomaly detection, LLM-generated dashboards, and intelligent system insights.

## 🚀 Quick Start

**Prerequisites:** Docker only! All development tools run in containers.

```bash
# 1. Clone and setup
git clone https://github.com/clayroach/otel-ai.git
cd otel-ai

# 2. One-command setup
pnpm setup

# 3. Start developing
pnpm dev
```

## 🏗️ Architecture

- **ClickHouse**: Real-time analytics storage for traces, metrics, logs
- **MinIO**: S3-compatible object storage for data archival
- **Effect-TS**: Functional programming with type-safe error handling
- **OpenTelemetry**: Industry-standard observability data collection

## 📦 Development Workflow

### Modern Task Runner

Instead of Makefiles, we use a modern JavaScript-based task runner:

```bash
# Using npm scripts (recommended)
pnpm setup          # Initial setup
pnpm dev           # Development mode
pnpm build         # Build project
pnpm test          # Run tests
pnpm ci            # CI checks (format, lint, typecheck, test)

# Or using the task runner directly
node .taskfile.js setup
node .taskfile.js dev
# ... etc

# Pro tip: Add alias for convenience
alias task='node .taskfile.js'
task help
```

### Infrastructure Management

```bash
# Infrastructure control
pnpm infra:up       # Start ClickHouse, MinIO, OTel Collector
pnpm infra:down     # Stop all services
pnpm infra:reset    # Reset with clean volumes
pnpm infra:logs     # View service logs
```

### Development Container

```bash
# Use development container with all tools pre-installed
pnpm dev:container  # Start dev container
pnpm dev:shell      # Get shell in running container
```

## 🧪 Testing

```bash
pnpm test              # Unit tests
pnpm test:coverage     # Coverage report
pnpm test:integration  # Integration tests (requires Docker)
```

## 📊 Current Status

### ✅ Completed (Day 1)

- [x] Docker-based development environment
- [x] TypeScript project structure with Effect-TS
- [x] ClickHouse + MinIO + OpenTelemetry Collector setup
- [x] Storage package with OTLP ingestion
- [x] End-to-end telemetry pipeline (traces, metrics, logs)
- [x] Modern development workflow

### 🚧 In Progress (Days 2-30)

- [ ] AI Analyzer package (autoencoder-based anomaly detection)
- [ ] LLM Manager package (multi-model orchestration)
- [ ] UI Generator package (React component generation)
- [ ] Config Manager package (self-healing configuration)

## 🏛️ Project Structure

```
otel-ai/
├── src/                    # Source code
│   ├── storage/           # ClickHouse + S3 storage layer
│   ├── ai-analyzer/       # Anomaly detection (TODO)
│   ├── llm-manager/       # Multi-model LLM orchestration (TODO)
│   ├── ui-generator/      # Dynamic React components (TODO)
│   └── config-manager/    # Self-healing config (TODO)
├── docker/                # Container configurations
│   ├── clickhouse/       # ClickHouse schema and init
│   ├── otel-collector/   # OpenTelemetry Collector config
│   └── envoy/           # Load balancer config
├── notes/                 # Dendron documentation vault
│   ├── daily/           # Development journal
│   ├── packages/        # Package specifications
│   └── design/         # Architecture decisions
└── scripts/              # Code generation and utilities
```

## 🔧 Development Philosophy

This project demonstrates **documentation-driven development**:

1. **Specifications First**: Write detailed package specs in `notes/packages/`
2. **Generate Code**: Use scripts and AI to generate implementation
3. **Keep in Sync**: Bidirectional sync between docs and code
4. **Ship Fast**: 30-day timeline with daily progress tracking

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

## 🤝 Contributing

This is a 30-day challenge project, but contributions are welcome! Check the daily notes in `notes/daily/` for current progress and goals.

---

**🤖 Generated with [Claude Code](https://claude.ai/code)**
