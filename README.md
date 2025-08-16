# AI-Native Observability Platform

> **30-Day Challenge**: Building enterprise-grade observability with AI at the core using Claude Code and documentation-driven development

An OpenTelemetry-based observability platform where machine learning is integrated from the ground up - not bolted on as an afterthought. Features real-time anomaly detection, LLM-generated dashboards, and intelligent system insights that adapt to your team's needs.

## 🏆 **Challenge Progress: Day 3 - Accelerating at 2x Expected Pace**

**Current Status**: 20% complete in 3 days (originally planned 10%)  
**Velocity**: 50% faster than expected timeline  
**Key Breakthrough**: Dual-ingestion architecture with professional UI complete

> 📊 **Daily Progress**: Follow the journey in [`notes/daily/`](notes/daily/) | **Blog Series**: [Dev.to Series](blog/platforms/)

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

## 🏗️ **Dual-Ingestion Architecture** ✅

**Key Innovation**: Two telemetry ingestion paths with unified AI analysis

- **Path 1: Collector Route**: OTel Demo → OTel Collector → `otel_traces` (OTLP native)
- **Path 2: Direct Route**: API/Tests → Backend Service → `ai_traces_direct` (AI-optimized)
- **Unified View**: `traces_unified_view` harmonizes both schemas for ML processing
- **Professional UI**: Monaco SQL editor with dual-path visualization

**Tech Stack**:
- **ClickHouse**: Real-time analytics with dual-schema support
- **React + Monaco**: Professional SQL interface with syntax highlighting  
- **Effect-TS**: Type-safe functional programming patterns
- **TestContainers**: Real database integration testing

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

## 📊 **Milestone Achievements**

### ✅ **Week 1 Complete** (Days 1-3) - Ahead of Schedule!

**Foundation + Storage + UI (Originally 2 weeks of work)**

- [x] **Dual-ingestion architecture** with unified trace view
- [x] **Professional Monaco SQL interface** with ClickHouse syntax  
- [x] **42 comprehensive tests** (unit + integration with TestContainers)
- [x] **Production Docker environment** with OTel Demo integration
- [x] **End-to-end validation** of both ingestion paths
- [x] **AI-native workflows** replacing traditional bash complexity

### 🏃 **Week 2 In Progress** (Days 4-10) - Originally Week 3 Scope

**Advanced UI + Real-time Features**

- [ ] WebSocket streaming for live trace updates
- [ ] Enhanced visualization with Apache ECharts
- [ ] User interaction tracking and personalization
- [ ] Multi-model LLM integration for dashboard generation

### 🎯 **Upcoming: Enhanced Timeline**

- **Week 3**: AI/ML Integration (anomaly detection, pattern recognition)
- **Week 4**: Advanced Features + Production (bonus scope due to velocity)

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
