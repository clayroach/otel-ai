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

## ⚠️ CRITICAL: No Time Estimates in Implementation Plans

**NEVER include time estimates or duration commitments in implementation guidance:**

❌ **DON'T**:
- Use "Days 1-2", "Week 1", "2-3 days", etc. in implementation plans
- Add timeline estimates to phases or tasks
- Include duration-based project planning
- Suggest completion timeframes

✅ **DO**:
- Use phase-based organization (Phase 1, Phase 2, Phase 3)
- Use priority-based labels (Immediate, Short-term, Long-term)
- Focus on dependency relationships between tasks
- Emphasize technical approach over timing

**Examples**:
- ✅ "Phase 1: Immediate Fixes"
- ❌ "Phase 1: Day 1-2 Fixes"
- ✅ "Phase 2: Core Infrastructure"
- ❌ "Phase 2: Week 2-3 Infrastructure"

**Rationale**: Time estimates can create false expectations and pressure. Focus on clear technical approach and logical task sequencing instead.

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

This project uses **documentation-driven development** with **AI subagent orchestration**:

1. **Write specifications first** in `notes/packages/[package]/package.md`
2. **Use specialized subagents** for daily workflow management
3. **Generate code** using AI assistance and Claude code integration
4. **Keep documentation in sync** with implementation changes

## Feature Implementation Workflow - Plan Mode Standard

### **CRITICAL: Always Use Plan Mode for ALL Development Work**

**Every piece of work requires a GitHub issue and documented plan** - this ensures context recovery if Claude sessions are lost.

#### Step 1: Ensure GitHub Issue Exists
```bash
# For features: Use existing feature issue
# For refactors: Create a refactor issue first
# For bugs: Use existing bug issue
# For improvements: Create improvement issue first
```
**NO WORK WITHOUT AN ISSUE** - This is critical for context recovery

#### Step 2: Enter Plan Mode
```
# Start in plan mode to research and understand requirements
claude-code --plan
```

#### Step 3: Research & Analysis Phase
In plan mode, Claude will:
1. **Analyze the GitHub issue** thoroughly
2. **Examine existing codebase** for context and patterns
3. **Research dependencies** and integration points
4. **Create comprehensive implementation plan with checklist**
5. **DO NOT make any changes** during planning phase

#### Step 4: Document Plan as GitHub Comment
Once the plan is ready:
1. **Add plan as comment** to the GitHub issue
2. **Include mandatory checklist** with all implementation steps
3. **Use structured markdown** with phases and technical details
4. **Include success metrics** and key decisions
5. **Link to relevant code** and documentation

#### Step 5: Exit Plan Mode & Implement
After plan is documented:
1. **Exit plan mode** to begin implementation
2. **Follow the checklist** - check off each item as completed
3. **Update GitHub issue** with progress
4. **Create PR** referencing the plan comment

### Example Workflows

#### Feature Implementation
```bash
# 1. Start with plan mode for existing feature issue
claude-code --plan
> "I'd like to implement issue #119"
# Claude researches, analyzes, creates plan with checklist

# 2. Add plan to GitHub
> "Please add this plan as a comment to the GitHub feature"
# Plan with checklist is documented on issue

# 3. Exit plan mode and implement
> "Let's implement this plan"
# Claude follows checklist systematically
```

#### Refactor or Ad-hoc Work
```bash
# 1. Create GitHub issue first
> "Create a GitHub issue for refactoring the storage layer"
# Claude creates issue #150

# 2. Enter plan mode
claude-code --plan
> "I need to refactor the storage layer - issue #150"
# Claude analyzes and creates refactor plan

# 3. Document plan
> "Add this refactor plan to issue #150"
# Plan becomes permanent record

# 4. Implement with checklist
> "Let's proceed with the refactor"
# Claude follows documented checklist
```

### Mandatory Plan Components

Every plan MUST include:
1. **Implementation Checklist** - Step-by-step tasks that can be checked off
2. **Success Metrics** - Clear criteria for completion
3. **Technical Decisions** - Key architecture and design choices
4. **File References** - Links to relevant code locations
5. **Dependencies** - External packages or services required

Example Checklist Format:
```markdown
## Implementation Checklist

- [ ] Create component structure in ui/src/views/TraceView/
- [ ] Add route to App.tsx for /traces/:traceId
- [ ] Implement data fetching hook with React Query
- [ ] Create span tree builder utility
- [ ] Implement ECharts timeline visualization
- [ ] Add interactive controls (zoom, pan, filter)
- [ ] Create span details panel
- [ ] Add minimap navigation
- [ ] Write unit tests for utilities
- [ ] Write integration tests for components
- [ ] Update documentation
```

### Benefits of Plan Mode Workflow
- **Context Recovery** - GitHub issues preserve all context if sessions are lost
- **No premature implementation** - Research first, code second
- **Clear documentation** - Plans become part of issue history
- **Better architecture** - Comprehensive analysis before coding
- **Traceable decisions** - Plans document technical choices
- **Consistent approach** - Standardized across all work
- **100% completion** - Checklists ensure no steps are missed

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

### 2. GitHub Issues Review (2-3 seconds)
```bash
# Check public repo issues
mcp__github__list_issues owner:clayroach repo:otel-ai state:OPEN

# Check private repo for sensitive planning (if accessible)
mcp__github__list_issues owner:clayroach repo:otel-ai-private state:OPEN

# Filter for high priority or assigned issues
mcp__github__search_issues query:"repo:clayroach/otel-ai is:open is:issue assignee:@me"
```

### 3. Package Context (Auto-loaded)
When working in any package directory, Claude automatically reads the package's CLAUDE.md file which contains:
- Package conventions and patterns
- API contracts and interfaces
- Common pitfalls to avoid
- Quick start commands

### 4. Recent Context Recovery
- Check for yesterday's daily note in `notes/daily/`
- Review any uncommitted work or staged changes
- Identify work items that were in progress

**Performance Target:** <5 seconds total startup time

This automatic context recovery ensures Claude maintains continuity across sessions without requiring manual context loading or explicit instructions to read documentation files.

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
- **code-implementation-planning-agent** - Transform design documents into Effect-TS code with strong typing and tests

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
# IMPORTANT: Run these checks BEFORE using pr-creation-agent
pnpm typecheck:all  # Ensure no TypeScript errors
pnpm lint          # Ensure no linting issues

# Then create PR (only after above pass)
Use the pr-creation-agent to organize screenshots and create comprehensive PRs.
```

**Note**: The pr-creation-agent has limited tools (Read, Write, Edit, Glob, Grep, LS) for safety.

#### Recover Session Context
```
Use the claude-review-session-agent to understand recent development context and identify gaps between planned and implemented features.
```

#### Implement Features from Design Documents
```
Use the code-implementation-planning-agent when you have a design document or specification and need to implement production-ready code with Effect-TS patterns, strong typing, and comprehensive tests.
```

### Orchestration Patterns

**Daily Development Workflow**:
1. Start day → `start-day-agent` sets goals
2. Context recovery → `claude-review-session-agent` provides historical understanding
3. Feature implementation → `code-implementation-planning-agent` for design-to-code transformation
4. Development work with periodic `testing-agent` validation
5. Before commits → `code-review-agent` quality check
6. After major changes → `code-to-docs-sync-agent` alignment
7. End day → `end-day-agent` review and content generation

**Quality Assurance Workflow**:
1. `testing-agent` → comprehensive validation
2. `code-review-agent` → quality and convention check
3. `code-to-docs-sync-agent` → documentation alignment
4. Ready for commit/PR

### Plan Mode Integration Pattern

**For Feature Implementation from GitHub Issues**:
1. User requests feature → **Enter plan mode first**
2. Research phase → Analyze issue, codebase, dependencies
3. Planning phase → Create structured implementation plan
4. Documentation → **Add plan as GitHub issue comment**
5. Implementation → Exit plan mode and follow plan

**Example**:
```bash
# User wants to implement trace view feature
User: "I'd like to implement issue #119"
Claude: [Enters plan mode, researches, creates plan]
Claude: "I've created a comprehensive implementation plan. Shall I add it to the issue?"
User: "Yes, please add this plan as a comment to the GitHub feature"
Claude: [Adds plan to GitHub using gh issue comment]
User: "Great, now let's implement it"
Claude: [Exits plan mode, begins implementation following the plan]
```

**Benefits**:
- Plans become permanent documentation in issue history
- Technical decisions are traceable
- No premature implementation before understanding
- Consistent approach across all features

**Feature Implementation Workflow**:
1. `code-implementation-planning-agent` → transform design doc to Effect-TS code
2. Agent creates interfaces, schemas, and error types first
3. Implements services with Effect patterns and strong typing
4. Creates unit and integration tests at each phase
5. `testing-agent` → validate all tests pass
6. `code-review-agent` → ensure no "any" types or eslint issues

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