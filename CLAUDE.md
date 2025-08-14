# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI-native observability platform** being built in 30 days using **documentation-driven development** with Dendron and Claude Code. The project demonstrates how modern AI development tools can compress traditional 12+ month enterprise development timelines to 30 days.

### Project Vision
Building an AI-native observability platform where machine learning is integrated at the core, not as an afterthought. Key differentiators:
- **Real-time anomaly detection** using autoencoders trained on telemetry data
- **LLM-generated dashboards** that adapt to user roles and usage patterns  
- **Self-healing configuration management** that fixes issues before they impact applications
- **Multi-model AI orchestration** (GPT, Claude, local Llama) with intelligent routing
- **No Grafana required** - platform generates React components dynamically

### 30-Day Timeline Challenge
This project aims to prove that AI-assisted development can achieve what traditionally requires:
- **Team of 10+ developers** → **Solo developer with Claude Code**
- **12+ months development** → **30 days**
- **Traditional workflows** → **Documentation-driven development**

## Architecture

The project consists of three main components:
- **Dendron Documentation Vault** (`notes/`) - Living specifications and design decisions
- **Instrumented Packages** (`src/`) - Generated OpenTelemetry implementations
- **Backend Storage** - Clickhouse for telemetry data

Core packages:
- `storage` - Clickhouse integration with OTLP ingestion and S3 backend
- `ai-analyzer` - Autoencoder-based anomaly detection and pattern recognition
- `llm-manager` - Multi-model LLM orchestration (GPT, Claude, Llama)
- `ui-generator` - LLM-powered React component generation with Apache ECharts
- `config-manager` - AI-powered self-healing configuration management
- `deployment` - Bazel build system with single-command deployment

## Development Workflow

This project uses **documentation-driven development**:

1. **Write specifications first** in `notes/packages/[package]/package.md`
2. **Generate code** using the scripts and Copilot integration
3. **Keep documentation in sync** with implementation changes

### Key Scripts

```bash
# Daily workflow
./scripts/start-day.sh          # Start of day setup and goal setting
./scripts/end-day.sh            # End of day archiving and blog generation

# Documentation workflow  
./scripts/generate-from-note.sh notes/packages/storage/package.md
./scripts/update-note-from-code.sh src/storage
./scripts/sync-all-notes.sh

# Archiving and publishing
./scripts/archive-claude-discussion.sh    # Archive Claude Code conversations
./scripts/generate-blog-from-daily.sh     # Generate blog posts from daily notes
./scripts/quick-archive.sh                # Combined archiving and blog generation
```

### Dendron Integration

This project uses Dendron for documentation management:
- Daily journal in `notes/daily/`
- Package docs in `notes/packages/`
- Design decisions in `notes/design/adr/`
- Templates in `notes/templates/`

## Documentation Structure

```
notes/
├── daily/           # Daily development journals
├── packages/        # Package specifications and docs
│   ├── tracer/     # Tracing implementation
│   ├── metrics/    # Metrics implementation  
│   └── exporter/   # Export implementations
├── design/         # Architecture decisions
│   └── adr/       # Architecture Decision Records
└── templates/      # Note templates
```

## Daily Workflow Integration

### Start of Day Process
```bash
./scripts/start-day.sh
```
Then begin Claude Code session with:
> "I'm ready to continue with Day X of the AI-native observability platform. Today's main goals: [specific objectives]"

### End of Day Process  
```bash
./scripts/end-day.sh
```
This automatically:
- Archives Claude Code conversations
- Generates blog posts for Dev.to, Medium, LinkedIn
- Tracks progress and completed goals
- Sets up for next day

### Blog Publishing Strategy
- **Primary**: Dev.to with "30-Day AI-Native Observability Platform" series
- **Secondary**: Medium for broader reach after 2-3 days
- **Supplementary**: LinkedIn for professional network exposure

## Effect-TS Integration

All data processing layers use Effect-TS for:
- **Schema validation** with runtime safety and compile-time types
- **Structured error handling** with tagged union ADTs
- **Streaming data processing** with backpressure management
- **Resource management** with automatic cleanup
- **Dependency injection** using Context and Layer patterns
- **Scheduled operations** with built-in cron scheduling

## OpenTelemetry Patterns

Follow these patterns when implementing:

### Tracer Implementation
```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('package-name', '1.0.0');

function instrumentedFunction() {
  return tracer.startActiveSpan('operation.name', (span) => {
    try {
      span.setAttributes({
        'service.name': 'my-service',
        'operation.type': 'process'
      });
      // ... operation logic
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Metrics
```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('package-name', '1.0.0');
const counter = meter.createCounter('operations.count');
const histogram = meter.createHistogram('operation.duration');

counter.add(1, { 'operation.type': 'process' });
histogram.record(durationMs, { 'operation.status': 'success' });
```

## Design Principles

1. **Zero-Cost Abstraction** - Minimal overhead when disabled
2. **Semantic Conventions** - Follow OpenTelemetry standards strictly
3. **Graceful Degradation** - System works even if telemetry fails
4. **Configuration Over Code** - Prefer environment-based config
5. **Testability** - All instrumentation must be testable in isolation

## Code Quality Standards

- TypeScript with strict mode enabled
- 80% minimum test coverage
- JSDoc comments for all public APIs
- Follow OpenTelemetry semantic conventions
- Consistent error handling patterns

## Working with Copilot

This project includes comprehensive Copilot instructions in `.github/copilot-instructions.md`. Key patterns:

### Generate from specification:
```
@workspace Read notes/packages/tracer/package.md and generate a complete tracer implementation in src/tracer/
```

### Update documentation:
```
@workspace Analyze src/metrics/ and update notes/packages/metrics/package.md with current implementation details
```

## Package Generation Workflow

### For New Packages
1. **Read specification** in `notes/packages/[package]/package.md`
2. **Use Effect-TS patterns** for service definitions and error handling
3. **Generate comprehensive code** with interfaces, implementations, and tests
4. **Follow OOTB OpenTelemetry Collector** integration (not custom OTel packages)
5. **Implement Bazel build integration** for reproducible builds

### Current Package Status (Day 1 Complete)
- ✅ **storage** - Clickhouse/S3 with OTLP ingestion (specification complete)
- ✅ **ai-analyzer** - Autoencoder anomaly detection (specification complete)  
- ✅ **llm-manager** - Multi-model orchestration (specification complete)
- ✅ **ui-generator** - React component generation (specification complete)
- ✅ **config-manager** - Self-healing configuration (specification complete)
- ✅ **deployment** - Bazel build + deployment (specification complete)

## Important Notes

- **Always read package specifications** in `notes/packages/` before implementing
- **Use Effect-TS service patterns** with Context, Layer, and Schema validation
- **Document design decisions** in ADRs under `notes/design/adr/`
- **Follow the bidirectional sync workflow** between documentation and code
- **Use OOTB OpenTelemetry Collector** with direct OTLP → Clickhouse export
- **Archive all Claude Code sessions** for complete development history
- **Publish daily progress** to Dev.to series for community engagement
- **Target 30-day completion** with weekly milestones and daily goals