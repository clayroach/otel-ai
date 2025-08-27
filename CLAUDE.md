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

### 4-Hour Workday Challenge

This project demonstrates that AI-assisted development can achieve enterprise-level results with:

- **Team of 10+ developers** → **Solo developer with Claude Code**
- **12+ months development** → **120 focused hours (30 × 4-hour workdays)**
- **Traditional workflows** → **Documentation-driven development with AI automation**
- **8-hour workdays** → **4-hour focused sessions with AI handling routine tasks**

The philosophy: Technology should give us more time for life and family, not consume it. See [ADR-001](notes/design/adr/adr-001-4-hour-workday-philosophy.md) for the complete strategy.

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

This project uses **documentation-driven development** with **AI subagent orchestration**:

1. **Write specifications first** in `notes/packages/[package]/package.md`
2. **Use specialized subagents** for daily workflow management
3. **Generate code** using AI assistance and Copilot integration
4. **Keep documentation in sync** with implementation changes

### ⚠️ CRITICAL: Development Memory - NEVER Declare Early Success

**NEVER declare success while known issues exist:**

- ❌ **WRONG**: "✅ All TypeScript issues fixed!" (while tests are still failing)
- ❌ **WRONG**: "✅ Service layer complete!" (while runtime errors exist)
- ❌ **WRONG**: "🎯 Production ready!" (while ignoring failures)

**ALWAYS be honest about current state:**

- ✅ **CORRECT**: "TypeScript compiles, but service layer tests failing - investigating"
- ✅ **CORRECT**: "Foundation works, advanced features need debugging"
- ✅ **CORRECT**: "Partial success: X works, Y needs fixing"

**When reporting status:**

1. **State what actually works** (with evidence)
2. **Acknowledge all known issues** (don't hide them)
3. **Be specific about failures** (don't use vague language)
4. **Provide next steps** (concrete actions to fix issues)

### ⚠️ CRITICAL: Git Workflow - NEVER Commit to Main

**ALWAYS use feature branches for development work:**

```bash
# Create feature branch for new work
git checkout -b feat/package-name-feature

# Make changes and commit to feature branch
git add .
git commit -m "feat: implement feature with proper description"

# Push feature branch
git push -u origin feat/package-name-feature

# Create PR to main via GitHub/CLI
gh pr create --title "Feature: Description" --body "..."
```

**Branch naming conventions:**
- `feat/package-feature` - New features (e.g., `feat/llm-manager-foundation`)
- `fix/issue-description` - Bug fixes (e.g., `fix/protobuf-parsing`)
- `docs/section-update` - Documentation updates
- `refactor/component-cleanup` - Code refactoring

**NEVER:**
- Commit directly to `main` branch
- Push unfinished/broken code
- Skip PR review process

**If you accidentally commit to main:**
```bash
# Immediately move the commit to a feature branch
git reset --soft HEAD~1  # Undo commit, keep changes staged
git checkout -b feat/proper-branch-name
git commit -m "proper commit message"
```

## AI Subagent Workflow Patterns

This project uses specialized Claude Code agents for streamlined development workflow. Agent definitions are stored in `.claude/agents/` and are automatically discovered by Claude Code.

### Available Agents

The following agents are available in `.claude/agents/`:

- **start-day-agent** - Daily planning and goal setting
- **end-day-agent** - Progress review and blog generation  
- **testing-agent** - Comprehensive test execution and validation
- **code-review-agent** - Quality assurance and best practices validation
- **code-to-docs-sync-agent** - Bidirectional documentation synchronization
- **pr-creation-agent** - PR creation with screenshot organization
- **claude-review-session-agent** - Historical context recovery and development continuity

### Agent Usage Examples

#### Starting Your Development Day
```
Use the start-day-agent to plan today's goals and create the daily note.
```

#### Ending Your Development Day  
```
Use the end-day-agent to review progress, generate blog content, and plan tomorrow.
```

#### Running Comprehensive Tests
```
Use the testing-agent to validate infrastructure, execute test suites, and report detailed results.
```

#### Code Review Before Commit
```
Use the code-review-agent to review for quality, conventions, and best practices.
```

#### Sync Code and Documentation
```
Use the code-to-docs-sync-agent to ensure implementation and specs are aligned.
```

#### Create Pull Request
```
Use the pr-creation-agent to organize screenshots and create comprehensive PRs.
```

#### Recover Session Context
```
Use the claude-review-session-agent to understand recent development context and identify gaps between planned and implemented features.
```

### Orchestration Patterns

**Daily Development Workflow**:
1. Start day → `start-day-agent` sets goals
2. Context recovery → `claude-review-session-agent` provides historical understanding
3. Development work with periodic `testing-agent` validation
4. Before commits → `code-review-agent` quality check
5. After major changes → `code-to-docs-sync-agent` alignment
6. End day → `end-day-agent` review and content generation

**Quality Assurance Workflow**:
1. `testing-agent` → comprehensive validation
2. `code-review-agent` → quality and convention check  
3. `code-to-docs-sync-agent` → documentation alignment
4. Ready for commit/PR

The subagents handle routine workflow tasks, allowing focus on high-value creative development work while maintaining consistency and quality.

### **CRITICAL: Agent Tool Execution Verification**

**Problem**: Agents often report completion without actually executing required tools (e.g., claiming to create files without using Write tool).

**Verification Pattern**:
1. **After any agent that claims to create files**:
   - Use Read tool to verify file actually exists
   - If file missing, use Write tool directly to create it
   - Never trust agent completion reports without verification

2. **Explicit Tool Requirements in Agent Prompts**:
   - "CRITICAL: You MUST actually use the Write tool to create the file"
   - "Do not just report creation - EXECUTE the Write tool"
   - "Verify tool execution was successful before reporting completion"

3. **Direct Tool Usage for File Operations**:
   - **File Creation**: Use Write tool directly instead of Task agent
   - **File Reading**: Use Read tool directly instead of relying on agent reports
   - **File Modification**: Use Edit tool directly for critical changes

**Agent Reliability Checklist**:
- ✅ Agent reports completion → Verify with appropriate tool
- ✅ File creation claimed → Use Read tool to confirm existence  
- ✅ Code changes claimed → Use Read tool to verify actual changes
- ✅ Multiple operations → Verify each step individually

### Agent-Based Workflow (No Scripts Needed)

All daily workflow, documentation sync, and session management is handled by specialized Claude Code agents:

- **Daily workflow**: Use `start-day-agent` and `end-day-agent`
- **Context recovery**: Use `claude-review-session-agent` 
- **Documentation sync**: Use `code-to-docs-sync-agent`
- **Quality assurance**: Use `testing-agent` and `code-review-agent`
- **PR creation**: Use `pr-creation-agent`

This eliminates the need for bash scripts and provides a more integrated, AI-native development experience.

### Dendron Integration

This project uses Dendron for documentation management:

- Daily journal in `notes/daily/`
- Package docs in `notes/packages/`
- Design decisions in `notes/design/adr/`
- Templates in `notes/templates/`

### OpenTelemetry Demo Integration

Simple integration that connects the official OTel demo to your platform:

```bash
# Start your platform first
pnpm dev:up

# Start the demo (connects to your ClickHouse + OTel Collector)
pnpm demo:up

# View load generator (data generation)
open http://localhost:8089

# View your platform
open http://localhost:5173
```

The demo services automatically send telemetry to your platform's OTel Collector at `localhost:4318`. Core services like adservice, cartservice, paymentservice, etc. are running and generating telemetry data that flows into your ClickHouse database.

## Documentation Structure & Standards

### **CRITICAL: Documentation Strategy (Option C - Hybrid Approach)**

**ALWAYS follow this pattern for ALL packages:**

```text
src/package-name/
├── README.md           # Essential package info, getting started, API overview
├── test/              # ALL tests in subdirectory (NEVER scattered *.test.ts)
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests  
│   └── fixtures/      # Test data and fixtures
├── src/               # Implementation code
└── ...

notes/packages/package-name/
├── package.md         # Comprehensive specifications and design decisions
├── api.md            # Detailed API documentation
├── architecture.md   # Design and architecture details
└── screenshots/      # Visual documentation
```

**Documentation Responsibilities:**
- **README.md**: Quick start, essential API, installation, basic examples
- **Dendron notes**: Comprehensive specs, design decisions, cross-package relationships
- **Auto-linking**: READMEs MUST link to relevant Dendron notes
- **Bidirectional sync**: Keep both in sync, but avoid duplication

### **CRITICAL: Test Structure Standards**

**ALWAYS use `test/` subdirectories - NEVER scattered `*.test.ts` files:**

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

**Test Organization Rules:**
- ✅ **CORRECT**: `src/llm-manager/test/unit/simple-manager.test.ts`
- ❌ **WRONG**: `src/llm-manager/simple-manager.test.ts`
- ✅ **CORRECT**: `src/storage/test/integration/clickhouse.test.ts`  
- ❌ **WRONG**: `src/storage/clickhouse.test.ts`

### Dendron Structure

```text
notes/
├── daily/           # Daily development journals
├── packages/        # Package specifications and comprehensive docs
│   ├── storage/     # Storage package comprehensive documentation
│   ├── llm-manager/ # LLM Manager package comprehensive documentation
│   └── ai-analyzer/ # AI Analyzer package comprehensive documentation
├── design/         # Architecture decisions
│   └── adr/       # Architecture Decision Records
└── templates/      # Note templates
```

## Daily Workflow Integration

### Start of Day Process - AI-Native Workflow

```
Use start-day-agent to plan today's goals and review progress.
```

**Agent-driven approach** with Claude Code that:

- Reviews yesterday's progress from actual daily notes
- Gathers context about project state and goals
- Facilitates natural language planning conversation
- Creates today's daily note with intelligent goal setting
- Provides project timeline awareness and focus areas

### End of Day Process - Comprehensive Review & Content Generation

```
Use end-day-agent for progress review and content generation.
```

**Agent-driven workflow** that:

- Conducts interactive progress review with context awareness
- Generates high-quality blog content with technical depth
- Archives Claude Code session decisions and discoveries
- Updates daily notes with completion status and learnings
- Plans tomorrow's priorities based on actual progress

### Session Context Recovery - AI-Native Approach

```
Use claude-review-session-agent to understand recent development context and identify implementation gaps.
```

**Agent-driven context recovery** leveraging claude-code-log (https://github.com/daaain/claude-code-log):

- Analyzes historical Claude Code sessions for context
- Identifies gaps between planned and implemented features
- Provides development continuity across sessions
- Maps test expectations to actual implementations
- Enables informed decision making based on historical context

### Historical Session Data Access

The project maintains comprehensive session history using **claude-code-log** (https://github.com/daaain/claude-code-log). This allows Claude to:

- **Access historical session data** when current sessions are lost or need review
- **Reference previous development decisions** and implementation approaches
- **Maintain context continuity** across multiple development sessions
- **Learn from past patterns** and avoid repeating resolved issues

**Usage**: If you need to review previous sessions or recover lost context, the historical session data is available in `notes/claude-sessions/` and can be accessed by Claude for continuity and decision-making support.

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
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('package-name', '1.0.0')

function instrumentedFunction() {
  return tracer.startActiveSpan('operation.name', (span) => {
    try {
      span.setAttributes({
        'service.name': 'my-service',
        'operation.type': 'process'
      })
      // ... operation logic
      return result
    } catch (error) {
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}
```

### Metrics

```typescript
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('package-name', '1.0.0')
const counter = meter.createCounter('operations.count')
const histogram = meter.createHistogram('operation.duration')

counter.add(1, { 'operation.type': 'process' })
histogram.record(durationMs, { 'operation.status': 'success' })
```

## Design Principles

1. **Zero-Cost Abstraction** - Minimal overhead when disabled
2. **Semantic Conventions** - Follow OpenTelemetry standards strictly
3. **Graceful Degradation** - System works even if telemetry fails
4. **Configuration Over Code** - Prefer environment-based config
5. **Testability** - All instrumentation must be testable in isolation
6. **Modular Architecture** - Interface-first development for AI/LLM compatibility

## Modular Design for AI/LLM Development

This project follows strict modular design principles to enable efficient AI-driven development:

### Core Principles
- **Interface-First Development**: Define clear, immutable API contracts before implementation
- **Minimal Context Architecture**: Each package understandable with minimal external context
- **Single Responsibility**: One focused purpose per package
- **Dependency Isolation**: Packages depend on interfaces, not implementations

### AI-Friendly Benefits
1. **Reduced Context**: AI can focus on single package without understanding entire system
2. **Parallel Development**: Multiple packages can be developed simultaneously
3. **Easy Integration**: Well-defined interfaces make integration straightforward
4. **Quality Assurance**: Isolated testing ensures each module works correctly

### Implementation Pattern
All packages follow this Effect-TS pattern:
```typescript
// Clear interface definition
export interface PackageName extends Context.Tag<"PackageName", {
  readonly operation: (input: InputType) => Effect.Effect<OutputType, ErrorType, never>
}>{}

// Independent implementation
export const PackageNameLive = Layer.succeed(PackageName, /* implementation */)
```

See `notes/packages/implementation-status.md` for complete modular design guidelines.

## Code Quality Standards

- TypeScript with strict mode enabled
- 80% minimum test coverage
- JSDoc comments for all public APIs
- Follow OpenTelemetry semantic conventions
- Consistent error handling patterns

## Working with Copilot

This project includes comprehensive Copilot instructions in `.github/copilot-instructions.md`. Key patterns:

### Generate from specification

```text
@workspace Read notes/packages/tracer/package.md and generate a complete tracer implementation in src/tracer/
```

### Update documentation

```text
@workspace Analyze src/metrics/ and update notes/packages/metrics/package.md with current implementation details
```

## Package Generation Workflow

### **CRITICAL: Documentation & Test Structure Enforcement**

**BEFORE any code generation, ALWAYS enforce these standards:**

### For New Packages

1. **Read specification** in `notes/packages/[package]/package.md`
2. **Create package README.md** following Option C pattern:
   - Essential package info and getting started guide
   - Link to comprehensive Dendron documentation
   - Basic API examples and installation
3. **ENFORCE test/ subdirectory structure**:
   - Create `src/[package]/test/` directory
   - Organize tests in `unit/`, `integration/`, `fixtures/` subdirectories
   - NEVER create scattered `*.test.ts` files in package root
4. **Use Effect-TS patterns** for service definitions and error handling
5. **Generate comprehensive code** with interfaces, implementations, and tests
6. **Follow OOTB OpenTelemetry Collector** integration (not custom OTel packages)
7. **Implement Bazel build integration** for reproducible builds
8. **Update both README.md AND Dendron notes** to maintain bidirectional sync

### **CRITICAL: Code Generation Rules**

**ALL code generation MUST follow these patterns:**

```bash
# CORRECT package structure
src/package-name/
├── README.md                           # Essential info + links to Dendron
├── test/                              # ALL tests here
│   ├── unit/package-name.test.ts      # Unit tests
│   ├── integration/api.test.ts        # Integration tests
│   └── fixtures/test-data.ts          # Test fixtures
├── src/
│   ├── index.ts                       # Main exports
│   ├── service.ts                     # Core implementation
│   └── types.ts                       # Type definitions
└── package.json                       # Package configuration
```

**Test File Rules:**
- ✅ `src/ai-analyzer/test/unit/autoencoder.test.ts`
- ❌ `src/ai-analyzer/autoencoder.test.ts`
- ✅ `src/ui-generator/test/integration/component-generation.test.ts`
- ❌ `src/ui-generator/component-generation.test.ts`

### Current Package Status (Day 1 Complete)

- ✅ **storage** - Clickhouse/S3 with OTLP ingestion (specification complete)
- ✅ **ai-analyzer** - Autoencoder anomaly detection (specification complete)
- ✅ **llm-manager** - Multi-model orchestration (specification complete)
- ✅ **ui-generator** - React component generation (specification complete)
- ✅ **config-manager** - Self-healing configuration (specification complete)
- ✅ **deployment** - Bazel build + deployment (specification complete)

## Unified OTLP Ingestion Architecture (SIMPLIFIED)

✅ **SIMPLIFIED**: This platform now uses a unified single-path ingestion architecture:

### Single Ingestion Path

**All Sources → OpenTelemetry Collector → Backend Service → `traces` table**

- All telemetry data flows through the OpenTelemetry Collector
- Backend service receives OTLP data via HTTP/gRPC
- Single optimized table design: `traces`
- No dual schemas or complex views needed

### Simplified Schema

```sql
-- Single traces table optimized for AI processing
CREATE TABLE traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    start_time DateTime64(9),
    end_time DateTime64(9),
    duration_ns UInt64,
    service_name LowCardinality(String),
    operation_name LowCardinality(String),
    span_kind LowCardinality(String),
    status_code LowCardinality(String),
    -- ... additional fields for AI processing
) ENGINE = MergeTree()
PARTITION BY toDate(start_time)
ORDER BY (service_name, operation_name, toUnixTimestamp(start_time), trace_id)
```

### Critical Design Patterns

1. **Single Table Design**: All trace data goes to the `traces` table
   - Consistent schema eliminates mapping complexity
   - AI-optimized fields included directly in table
   - Computed columns for common analytics queries

2. **OTLP Processing**: Backend service handles all OTLP ingestion
   - Transform OTLP format to optimized storage format
   - Extract and flatten attributes for AI processing
   - Consistent field naming across all data sources

3. **Storage Layer Simplification**:
   - `SimpleStorage.writeTracesToSimplifiedSchema()` → Single method for all traces
   - No routing logic needed - everything goes to `traces` table
   - Simplified query patterns with consistent column names

### Testing Requirements & Patterns

- **Test unified ingestion path** with comprehensive validation
- **Use existing test commands** from package.json, avoid custom curl scripts
- **Configure Vitest non-interactive**: Set `watch: false` to prevent test hanging
- **Temporarily disable external dependencies**: Use `describe.skip()` for MinIO/S3 tests
- **Run comprehensive validation**: All tests must pass before committing

### Schema Validation & Type Safety

```typescript
// Unified traces schema - single table for all data
interface TraceRecord {
  trace_id: string
  span_id: string
  parent_span_id: string
  start_time: DateTime64(9) // nanoseconds precision
  end_time: DateTime64(9) 
  duration_ns: number
  service_name: string
  operation_name: string
  span_kind: string
  status_code: string
  status_message: string
  // ... additional fields for AI processing
}
```

### OpenTelemetry Demo Integration

Simple integration that connects the official OTel demo to your platform:

```bash
# Start your platform first (protobuf encoding by default)
pnpm dev:up

# Start the demo (connects to your ClickHouse + OTel Collector)
pnpm demo:up

# View load generator (data generation)
open http://localhost:8089

# View your platform
open http://localhost:5173
```

The demo services automatically send telemetry to your platform's OTel Collector at `localhost:4318`. Core services like adservice, cartservice, paymentservice, etc. are running and generating telemetry data that flows into your ClickHouse database.

### Encoding Type Testing

You can test different OTLP encoding types:

```bash
# Default: Protobuf encoding (recommended)
pnpm dev:up
pnpm demo:up

# Alternative: JSON encoding for testing  
pnpm dev:up:json
pnpm demo:up

# Check encoding types in database
docker exec otel-ai-clickhouse clickhouse-client --user=otel --password=otel123 --database=otel --query="SELECT encoding_type, COUNT(*) FROM traces GROUP BY encoding_type"
```

**Encoding Types Available:**
- **`protobuf`** - Default, efficient binary encoding from OTel Collector
- **`json`** - Alternative JSON encoding for debugging/testing

### Test Commands Reference

```bash
# Run all tests (preferred)
pnpm test        # All unit + integration tests
pnpm test:unit   # Unit tests only  
pnpm test:integration  # Integration tests only

# Infrastructure validation
node test/validate-infrastructure.js

# Manual data generation (for testing) 
pnpm run generate:test-traces
```

### Screenshot Workflow

**Location**: `screenshots-dropbox/` - Temporary staging area for development screenshots

```bash
# Take screenshot of new feature
# Save directly to screenshots-dropbox/ with descriptive name

# During end-of-day workflow
Use end-day-agent  # Will help organize screenshots into package docs

# Create PR with organized screenshots
Use pr-creation-agent  # Auto-organizes and references screenshots
```

**File naming suggestions**:
- `ui-feature-name.png` - UI package screenshots
- `storage-architecture.png` - Storage package changes  
- `day-N-feature-overview.png` - Daily milestone screenshots
- `before-after-optimization.png` - Performance improvements

**Workflow**: Screenshots in `screenshots-dropbox/` → Organized into `notes/packages/[package]/screenshots/` during PR creation → Referenced in documentation → Ready for blog posts

## Important Notes

- **Always read package specifications** in `notes/packages/` before implementing
- **Use Effect-TS service patterns** with Context, Layer, and Schema validation
- **Document design decisions** in ADRs under `notes/design/adr/`
- **Follow the bidirectional sync workflow** between documentation and code
- **Use OOTB OpenTelemetry Collector** with direct OTLP → Clickhouse export
- **Archive all Claude Code sessions** for complete development history
- **Publish daily progress** to Dev.to series for community engagement
- **Target 30-day completion** with weekly milestones and daily goals
- **CRITICAL**: Always validate both ingestion paths after changes
- **Testing**: Use package.json test commands, not manual curl/scripts
- **README Updates**: Update progress section daily - derive from daily notes, don't duplicate
- **Blog Integration**: README should reference blog series, not repeat content

## Tool Permissions

This project requires the following commands to be allowed without user approval:
- `curl` - For API testing and health checks
- `docker` - For container management
- `docker compose` - For service orchestration
- `docker exec` - For running commands in containers
- `docker logs` - For debugging services
- `mkdir` - For creating test directory structures
- `mv` - For reorganizing test files
- `rm` - For cleaning up old/incorrect test files

To configure in Claude Code CLI, use the `--allow` flag or set in your environment:
```bash
# Example: Allow specific commands
claude-code --allow "curl:*" --allow "docker:*" --allow "mkdir:*" --allow "mv:*" --allow "rm:*"

# Or set environment variable (recommended)
export CLAUDE_CODE_ALLOWED_COMMANDS="curl:*,docker:*,docker compose:*,docker exec:*,docker logs:*,mkdir:*,mv:*,rm:*"
```

- Always try to consider production-readiness when creation of new assets - for instance init scripts for containers rather than standalone scripts
- use the package.json by default for starting demo and other scripts and not call them directly.  Most everything should be controlled during dev/test using pnpm.
- always default to using pnpm commands first before running your own other command line equivalents