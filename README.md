# AI-Native Observability Platform

> **30-Day Challenge**: Building enterprise-grade observability with AI at the core using Claude Code and documentation-driven development

An OpenTelemetry-based observability platform where machine learning is integrated from the ground up - not bolted on as an afterthought. Features real-time anomaly detection, LLM-generated dashboards, and intelligent system insights that adapt to your team's needs.

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, pnpm, Docker

```bash
# 1. Clone and setup
git clone https://github.com/clayroach/otel-ai.git
cd otel-ai
pnpm install

# 2. Start the platform
pnpm dev:up        # Start platform services (Docker)
pnpm dev           # Start development server

# 3. Try the OpenTelemetry Demo integration
pnpm demo:up       # Start demo with your platform as backend

# 4. Access the platform
open http://localhost:5173  # Platform UI
open http://localhost:8089  # Load generator
```

That's it! You now have:
- ✅ **ClickHouse** storing telemetry data  
- ✅ **OpenTelemetry Collector** ingesting traces
- ✅ **Demo services** generating realistic telemetry
- ✅ **AI-ready platform** processing the data

## 🏆 What Makes This Special

### AI-Native Architecture
Unlike traditional observability tools that bolt on AI features, this platform is **built AI-first**:

- **Real-time anomaly detection** using autoencoders trained on telemetry data
- **LLM-generated dashboards** that adapt to user roles and usage patterns  
- **Self-healing configuration management** that fixes issues before they impact applications
- **Multi-model AI orchestration** (GPT, Claude, local Llama) with intelligent routing
- **No Grafana required** - platform generates React components dynamically

### 30-Day Development Challenge
This project demonstrates that AI-assisted development can achieve enterprise-level results with:

- **Team of 10+ developers** → **Solo developer with Claude Code**
- **12+ months development** → **30 focused days (120 hours)**
- **Traditional workflows** → **Documentation-driven development with AI automation**

> 📊 **Follow the Journey**: [`notes/daily/`](notes/daily/) | **Blog Series**: [Dev.to](https://dev.to/clayroach)

## ✨ Key Features

### Current Implementation
- **🔄 Unified OTLP Ingestion** - Single path for all telemetry data
- **💾 ClickHouse Storage** - Real-time analytics with AI-optimized schema  
- **🎯 OTel Demo Integration** - "Bring Your Own Backend" approach
- **🏗️ Professional UI** - Monaco SQL editor with syntax highlighting
- **🧪 Comprehensive Testing** - 42+ tests with TestContainers integration
- **📦 Container-Native** - Docker-first with production migrations

### AI Features (In Progress)
- **🤖 Multi-Model LLM Manager** - GPT-4, Claude, Local Llama orchestration
- **📊 Dynamic UI Generation** - React components from natural language
- **🔍 Anomaly Detection** - Autoencoder-based pattern recognition  
- **📈 Critical Path Analysis** - AI-powered service dependency analysis

## 🎯 Real-World Demo

The platform integrates with the **official OpenTelemetry Demo** to provide realistic telemetry data:

```bash
pnpm demo:up  # Starts 15+ microservices
```

**Demo Services**: Frontend, payment, cart, shipping, product catalog, ad service, recommendation engine, and more - all sending telemetry to your AI platform.

**Live Data Flow**: 
```
OTel Demo Services → OTel Collector → Your Platform → ClickHouse → AI Analysis
```

## 🏛️ Architecture

```
┌─ OpenTelemetry Demo ─────┐    ┌─ AI-Native Platform ──────────────┐
│                          │    │                                   │
│  Frontend ────┐          │    │  ┌─ OTel Collector              │
│  Payment ─────┤          │    │  │                               │
│  Cart ────────┤ Telemetry├────┼─▶│  Backend API                  │
│  Shipping ────┤          │    │  │                               │
│  Catalog ─────┤          │    │  └─ ClickHouse ──┐               │
│  Ads ─────────┘          │    │                   │               │
└──────────────────────────┘    │  ┌─ AI Layer ────▼─────────────┐ │
                                 │  │  Multi-Model LLM Manager   │ │
                                 │  │  Anomaly Detection Engine  │ │
                                 │  │  Dynamic UI Generator      │ │
                                 │  └────────────────────────────┘ │
                                 └───────────────────────────────────┘
```

## 🚀 Development Philosophy

**Documentation-Driven + AI-Native Workflows**

1. **📝 Specifications First** - Detailed package specs guide implementation
2. **🤖 AI-Assisted Generation** - Claude Code transforms specs into production code  
3. **📚 Living Documentation** - Bidirectional sync between docs and implementation
4. **⚡ Prompt-Driven Operations** - AI workflows instead of complex bash scripts
5. **✅ Continuous Validation** - Comprehensive testing ensures quality

**Key Insight**: When building AI-native systems, make the development process itself AI-native.

## 📦 Package Architecture

| Package | Purpose | Status |
|---------|---------|--------|
| [storage](src/storage/) | ClickHouse + S3 storage layer | ✅ Complete |
| [ai-analyzer](src/ai-analyzer/) | Anomaly detection with ML models | 🔄 In Progress |
| [llm-manager](src/llm-manager/) | Multi-model LLM orchestration | ✅ Complete |
| [ui-generator](src/ui-generator/) | Dynamic React components | 🔄 In Progress |
| [config-manager](src/config-manager/) | Self-healing configuration | 📋 Planned |
| [server](src/server/) | Backend API server | ✅ Complete |
| [ui](src/ui/) | Frontend React application | 🔄 In Progress |

> 📖 **For Developers**: See [DEVELOPER.md](DEVELOPER.md) for technical details, testing, and contribution guidelines.

## 📈 Why This Matters

This project proves that **AI-assisted development can compress traditional enterprise software timelines by 10x or more**:

### Traditional Enterprise Development
- 👥 **Team**: 10+ developers (frontend, backend, DevOps, QA)
- ⏰ **Timeline**: 12-18 months for MVP
- 💰 **Cost**: $2-5M+ in engineering costs
- 🐛 **Quality**: Often shipped with technical debt

### AI-Native Development Approach  
- 👤 **Team**: 1 developer + Claude Code
- ⏰ **Timeline**: 30 days (120 focused hours)
- 💰 **Cost**: <$10K (primarily AI API costs)
- ✨ **Quality**: Comprehensive testing, clean architecture

**Success Factors**:
- **Documentation-driven development** provides clear AI context
- **Professional UI early** enables faster debugging cycles  
- **Comprehensive testing** prevents rework and technical debt
- **AI-native workflows** eliminate traditional development overhead

## 🤝 Getting Involved

### For Users
1. **Try it out**: `pnpm dev:up && pnpm demo:up`
2. **Follow the journey**: [Daily notes](notes/daily/) and [blog series](https://dev.to/clayroach)
3. **Provide feedback**: What observability challenges do you face?

### For Developers  
1. **Read**: [DEVELOPER.md](DEVELOPER.md) for technical setup
2. **Explore**: Package documentation in [`notes/packages/`](notes/packages/)
3. **Contribute**: See [contribution guidelines](DEVELOPER.md#-contributing-guidelines)

### For AI Enthusiasts
1. **Study the approach**: [AI-native development philosophy](notes/inception.md)
2. **Examine the results**: Compare traditional vs AI-assisted timelines
3. **Apply the patterns**: Documentation-driven + AI-assisted workflows

## 📚 Resources

- **📊 Daily Progress**: [`notes/daily/`](notes/daily/) - Detailed development journal
- **📝 Blog Series**: [Dev.to articles](https://dev.to/clayroach) - Insights and lessons learned
- **🏗️ Architecture**: [`notes/design/`](notes/design/) - Technical decisions and ADRs
- **📦 Package Specs**: [`notes/packages/`](notes/packages/) - Detailed specifications
- **🛠️ Developer Guide**: [DEVELOPER.md](DEVELOPER.md) - Technical documentation

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

**🤖 Built with [Claude Code](https://claude.ai/code) | 📈 Demonstrating AI-accelerated development**

> **Current Focus**: Phase 3-4 test infrastructure and dynamic UI generation - see [`notes/daily/`](notes/daily/) for latest progress