# CLAUDE.md

AI assistance context for the otel-ai observability platform.

## Project Overview

Production-ready AI-native observability platform built with Effect-TS, OpenTelemetry, and multi-model LLM integration. Focuses on real-time anomaly detection, LLM-generated dashboards, and self-healing configuration management.

## ⚠️ CRITICAL: Avoid Over-Engineering

**ONLY implement what is explicitly requested - NO speculative features:**

❌ **DON'T**:
- Add "nice-to-have" features that weren't requested
- Create extensive abstractions for future use cases
- Build comprehensive solutions when simple ones suffice
- Add training data exports, manifest files, or formats not specified
- Expand scope beyond the immediate requirements

✅ **DO**:
- Implement EXACTLY what the issue/spec describes
- Use existing infrastructure (sessionId linkage, annotations)
- Keep solutions minimal and focused
- Ask for clarification rather than assuming requirements
- Leverage existing packages rather than creating new ones

**When in doubt**: Implement the minimum viable solution that meets the stated requirements.

## Architecture

**Core Packages** (`src/`):
- `storage` - ClickHouse + S3/MinIO integration
- `ai-analyzer` - Autoencoder anomaly detection
- `llm-manager` - Multi-model orchestration
- `ui-generator` - Dynamic React component generation
- `annotations` - Universal annotation system
- `otlp-capture` - OTLP data capture/replay
- `opentelemetry` - OTel instrumentation

**Each package has its own CLAUDE.md** with specific conventions, patterns, and pitfalls.

## Development Workflow

### Git Workflow - Never Commit to Main
```bash
git checkout -b feat/package-feature   # Create feature branch
git commit -m "feat: description"      # Commit with conventional message
git push -u origin feat/package-feature # Push branch
gh pr create                            # Create PR
```

### Critical Development Rules

1. **Be Honest About Status** - Never claim success while issues exist
2. **Use Feature Branches** - Never commit directly to main
3. **Test Before PR** - Run `pnpm typecheck:all` and `pnpm lint`
4. **Read Package CLAUDE.md** - Each package has specific conventions
5. **Use pnpm Commands** - Never use direct docker/npm/curl commands

### Test Organization
```
src/package/
├── test/           # ALL tests here (never scattered *.test.ts)
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── src/            # Implementation
```

## Available Agents

Located in `.claude/agents/`:
- `start-day-agent` - Daily planning and goal setting
- `end-day-agent` - Progress review and blog generation
- `testing-agent` - Test execution and validation
- `code-review-agent` - Quality assurance
- `pr-creation-agent` - PR creation with screenshots
- `claude-review-session-agent` - Context recovery

## Quick Commands

```bash
# Development
pnpm dev:up         # Start platform
pnpm demo:up        # Start OTel demo
pnpm dev:rebuild    # Rebuild after changes

# Testing
pnpm test           # Unit tests
pnpm test:integration # Integration tests
pnpm test:e2e       # E2E tests

# Always use pnpm commands - see all with:
pnpm run
```

## Package Documentation

**Each package in `src/` has its own CLAUDE.md** containing:
- Package-specific conventions and patterns
- Common pitfalls to avoid
- API contracts and interfaces
- Quick command reference

**Always read the package CLAUDE.md when working in that package.**

## Session Context Recovery

When starting a new session:
1. Check git status: `git branch --show-current && git status --short`
2. Review open issues: Use GitHub MCP tools
3. Read relevant package CLAUDE.md files
4. Check for work in progress

## Important Notes

- **Package specs first** - Read `notes/packages/[package]/` before implementing
- **Effect-TS patterns** - All packages use Context/Layer/Schema
- **Test commands only** - Use pnpm test commands, not custom scripts
- **Existing infrastructure** - Use what's built (annotations, capture) rather than creating new systems
- **Minimal solutions** - Implement only what's needed, not what might be useful
- **Documentation in sync** - Keep README.md and Dendron notes aligned

## OpenTelemetry Demo

```bash
pnpm dev:up     # Start platform
pnpm demo:up    # Start demo with feature flags
# Access: localhost:8089 (load generator), localhost:5173 (UI)
```

---
For detailed implementation patterns, see package-specific CLAUDE.md files in `src/*/CLAUDE.md`