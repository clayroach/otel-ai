# Feature-011: GitHub Issues Documentation Migration with Automatic Session Context

**Feature ID**: FEAT-011
**Status**: Partially Implemented
**Created**: 2025-09-23
**Updated**: 2025-09-23
**Author**: Claude Code with Human Architect
**Priority**: High
**Target Release**: Immediate (Week 1)
**Issue**: Manual documentation management and lack of collaborative features in current Dendron-only system
**Branch**: feat/github-issues-documentation-migration (ready for PR)

## Executive Summary

Migrate project documentation from Dendron-based notes to a hybrid system using GitHub Issues for collaboration and tracking, while implementing automatic session context recovery for Claude Code. This migration enables better team collaboration, leverages GitHub's MCP integration, and maintains efficient AI-assisted development workflows.

## Problem Statement

The current Dendron-based documentation system has limitations:
- No collaborative features for team members
- Manual context loading requiring explicit instructions to read package.md files
- Start-day/end-day agents add unnecessary overhead
- ADRs and features lack visibility and discussion threads
- Claude Code often misses important package context

## Proposed Solution

Implement a three-tier documentation system:
1. **GitHub Issues** - Features, bugs, ADRs, and collaborative discussions
2. **Package CLAUDE.md** - Auto-loaded package context and conventions
3. **Dendron Daily Notes** - Personal development journal (retained)

## Architecture

### Documentation Hierarchy

```
Project Root/
├── CLAUDE.md                    # Root instructions with session context
├── notes/
│   ├── daily/                  # RETAINED: Personal daily journals
│   ├── packages/               # DEPRECATED: Migrate to CLAUDE.md
│   └── design/adr/            # DEPRECATED: Migrate to GitHub Issues
├── src/
│   ├── storage/
│   │   ├── CLAUDE.md          # NEW: Auto-loaded package context
│   │   └── README.md          # Public documentation
│   ├── llm-manager/
│   │   ├── CLAUDE.md          # NEW: Auto-loaded package context
│   │   └── README.md          # Public documentation
│   └── [other-packages]/
│       ├── CLAUDE.md          # NEW: Auto-loaded package context
│       └── README.md          # Public documentation
└── .claude/agents/
    ├── start-day-agent.md     # DEPRECATED
    ├── end-day-agent.md       # DEPRECATED
    └── [other-agents]/        # RETAINED: Specialized agents
```

### GitHub Issues Structure

#### Issue Types and Labels

**Primary Types:**
- `type:feature` - Feature specifications and requirements
- `type:adr` - Architecture Decision Records
- `type:bug` - Bug reports and fixes
- `type:enhancement` - Improvements to existing features
- `type:documentation` - Documentation updates

**Package Labels:**
- `package:storage`
- `package:llm-manager`
- `package:ai-analyzer`
- `package:ui-generator`
- `package:config-manager`
- `package:deployment`
- `package:server`
- `package:ui`
- `package:build`

**Priority Labels:**
- `priority:critical` - Blocking issues
- `priority:high` - Important features
- `priority:medium` - Standard priority
- `priority:low` - Nice to have

**Status Labels:**
- `status:in-progress` - Active development
- `status:blocked` - Waiting on dependencies
- `status:review` - Ready for review
- `status:completed` - Done

#### Issue Templates

**Feature Specification Template:**
```markdown
## Feature: [Name]

### Problem Statement
[What problem does this solve?]

### Proposed Solution
[High-level approach]

### API Specification
[Effect-TS interfaces and schemas]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Related Issues
- Depends on: #XX
- Blocks: #YY
```

**ADR Template:**
```markdown
# ADR-XXX: [Decision Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[Background and problem]

## Decision
[What we're doing and why]

## Consequences
[Positive and negative impacts]

## References
- Related ADR: #YY
- Feature: #ZZ
```

### Package CLAUDE.md Format

Each package will have a CLAUDE.md file that is automatically loaded by Claude Code. Based on best practices from LangChain's guide on domain-specific Claude agents:

```markdown
# [Package Name] - Claude Context

## Package Overview
[Brief description and purpose - keep condensed and focused]
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Schema validation required for all inputs/outputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// ALWAYS use this pattern for new services
export interface ServiceName extends Context.Tag<"ServiceName", {
  readonly operation: (input: Input) => Effect.Effect<Output, Error, never>
}>{}

export const ServiceNameLive = Layer.succeed(ServiceName, {
  operation: (input) => Effect.gen(function* () {
    // Implementation
  })
})
```

### Error Handling Pattern
```typescript
// Use tagged union errors
export type ServiceError =
  | { _tag: "ValidationError"; message: string }
  | { _tag: "NetworkError"; cause: unknown }
  | { _tag: "UnknownError"; cause: unknown }
```

## API Contracts
[Effect-TS service definitions, interfaces, and schemas - include actual code]

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Using Promise/async-await instead of Effect
- ❌ Missing schema validation on external data
- ❌ Creating test files outside test/ directory
- ❌ Direct console.log instead of structured logging
- ❌ Circular dependencies between packages

## Testing Requirements
- Unit tests: Mock all external dependencies
- Integration tests: Require Docker running
- Performance tests: For any query operations
- Test commands: `pnpm test:unit:[package]`

## Performance Considerations
[Specific bottlenecks and optimization strategies]

## Dependencies & References
- External: [list with versions]
- Internal: [package dependencies]
- Documentation: [specific URLs for complex topics]

## Quick Start Commands
```bash
# Development
pnpm dev:[package]

# Testing
pnpm test:unit:[package]
pnpm test:integration:[package]

# Building
pnpm build:[package]

# Find active work
mcp__github__search_issues query:"package:[package-name] is:open"
```
```

### Automatic Session Context Recovery

Update root CLAUDE.md with automatic context loading:

```markdown
## Automatic Session Context Recovery

When starting a new Claude session, automatically:

1. **Check Git Status** (instant)
   - Uncommitted changes: `git status --short`
   - Recent commits: `git log --oneline -10`
   - Current branch: `git branch --show-current`

2. **Review GitHub Issues** (2-3 seconds)
   - Critical/in-progress: `mcp__github__list_issues` with filters
   - Recent comments: Check last 24h activity

3. **Load Recent Context** (if available)
   - Yesterday's daily note summary
   - Last session notes (if exists)

4. **Package Context** (lazy loaded)
   - CLAUDE.md loaded automatically when entering package

Performance target: <5 seconds total startup time
```

## Implementation Plan

### Phase 1: GitHub Infrastructure (Day 1)

1. **Create GitHub Labels**
   - Type labels (feature, adr, bug, enhancement, documentation)
   - Package labels (one per package)
   - Priority labels (critical, high, medium, low)
   - Status labels (in-progress, blocked, review, completed)

2. **Set Up Issue Templates**
   - Feature specification template
   - ADR template
   - Bug report template
   - Enhancement template

3. **Create Project Board**
   - Backlog column
   - In Progress column
   - Review column
   - Done column

### Phase 2: Package CLAUDE.md Files (Day 1-2)

Priority packages to migrate:
1. `storage/CLAUDE.md` - Include performance issue #57 context
2. `llm-manager/CLAUDE.md` - Multi-model orchestration patterns
3. `ai-analyzer/CLAUDE.md` - Autoencoder implementation
4. `ui-generator/CLAUDE.md` - Component generation patterns
5. `config-manager/CLAUDE.md` - Self-healing configuration
6. `server/CLAUDE.md` - Backend API patterns
7. `ui/CLAUDE.md` - Frontend architecture
8. `deployment/CLAUDE.md` - Bazel build configuration
9. `build/CLAUDE.md` - Build system patterns

### Phase 3: Content Migration (Day 2-3)

1. **Migrate ADRs to GitHub Issues**
   - Create issues with `type:adr` label
   - Preserve decision history
   - Link related ADRs

2. **Create Feature Issues**
   - Active development work
   - Planned enhancements
   - Link to package CLAUDE.md files

3. **Archive Dendron Package Notes**
   - Keep for reference
   - Mark as deprecated

### Phase 4: Update Root Documentation (Day 3)

1. **Update Root CLAUDE.md**
   - Add session context recovery section
   - Document GitHub issue workflow
   - Explain package CLAUDE.md pattern
   - Remove deprecated agent references

2. **Update README.md**
   - Reference GitHub issues for roadmap
   - Link to project board
   - Update contribution guidelines

### Phase 5: Agent Updates (Day 4)

1. **Archive Deprecated Agents**
   - start-day-agent.md → .archive/
   - end-day-agent.md → .archive/

2. **Update code-to-docs-sync-agent**
   - Modify to sync package CLAUDE.md files instead of Dendron notes
   - New sync targets:
     - `src/*/CLAUDE.md` ↔ Implementation code
     - API contracts in CLAUDE.md ↔ Actual TypeScript interfaces
     - Error types in CLAUDE.md ↔ Implemented error handling
   - Remove references to `notes/packages/*/package.md`
   - Add validation for mandatory conventions compliance

3. **Update Remaining Agents**
   - Update references to use GitHub issues
   - Add MCP GitHub integration examples

## Benefits

### For Development
- **Automatic Context** - Claude reads package CLAUDE.md without prompting
- **Reduced Overhead** - No manual agent invocations
- **Better Organization** - Clear separation of concerns
- **Fast Context Recovery** - <5 second session startup

### For Collaboration
- **Team Visibility** - GitHub issues are public and searchable
- **Discussion Threads** - Comments and reviews on issues
- **Cross-References** - Automatic linking between issues
- **Project Tracking** - Visual boards and milestones

### For AI Development
- **MCP Integration** - Native GitHub API access
- **Structured Data** - Issues follow consistent templates
- **Searchable** - Powerful query capabilities
- **Version Controlled** - Issue history tracked automatically

## Success Metrics

- Session context loads in <5 seconds
- Zero manual instructions needed for package context
- All ADRs migrated to GitHub issues
- Package CLAUDE.md files created for all packages
- Root CLAUDE.md updated with new workflow
- Deprecated agents archived

## Migration Checklist

### Completed (2025-09-23)
- [x] Create GitHub labels (all type, package, priority, status labels)
- [x] Set up issue templates (feature, ADR, bug, enhancement)
- [x] Create storage/CLAUDE.md with bug #57 context
- [x] Create llm-manager/CLAUDE.md with Portkey patterns
- [x] Create ai-analyzer/CLAUDE.md with ML patterns
- [x] Create ui-generator/CLAUDE.md with component generation
- [x] Create server/CLAUDE.md with OTLP ingestion
- [x] Create config-manager/CLAUDE.md with self-healing
- [x] Create ui/CLAUDE.md with React frontend patterns
- [x] Create notes/daily/CLAUDE.md with format guidelines
- [x] Document code-to-docs-sync-agent modifications

### Remaining Tasks
- [ ] Update code-to-docs-sync-agent implementation
- [ ] Migrate all ADRs to GitHub issues
- [ ] Update root CLAUDE.md with session context recovery
- [ ] Archive deprecated agents (start-day, end-day)
- [ ] Create active feature issues from MISC.md TODOs

### Ongoing
- [ ] Maintain GitHub issues as source of truth
- [ ] Update package CLAUDE.md files as needed
- [ ] Use daily notes for personal journal only
- [ ] Generate blog posts on-demand

## Code-to-Docs-Sync Agent Modifications

### New Sync Workflow
The code-to-docs-sync-agent needs updating to work with package CLAUDE.md files:

#### Sync Targets
```
BEFORE:
notes/packages/storage/package.md ↔ src/storage/
notes/packages/llm-manager/package.md ↔ src/llm-manager/

AFTER:
src/storage/CLAUDE.md ↔ src/storage/src/
src/llm-manager/CLAUDE.md ↔ src/llm-manager/src/
```

#### Validation Rules
1. **API Contracts**: Ensure TypeScript interfaces in code match those documented in CLAUDE.md
2. **Error Types**: Validate error ADTs are consistent between docs and implementation
3. **Service Patterns**: Check that service definitions follow documented patterns
4. **Test Structure**: Verify tests are in correct subdirectories as specified

#### Sync Operations
- **Code → CLAUDE.md**: Update API contracts when interfaces change
- **CLAUDE.md → Code**: Generate missing error types or service stubs
- **Validation Only**: Check compliance without making changes
- **Report Mode**: List discrepancies for manual review

#### Agent Prompt Updates
```markdown
Instead of syncing with notes/packages/*/package.md:
1. Read package CLAUDE.md files from src/*/CLAUDE.md
2. Focus on stable content (API contracts, patterns, conventions)
3. Ignore dynamic content (no active issues or status tracking)
4. Validate mandatory conventions are followed in implementation
5. Report violations of CRITICAL conventions
```

## Session Handoff (2025-09-23)

### Current Branch Status
- Branch: `feat/github-issues-documentation-migration`
- Status: Ready for PR creation
- Commits: 3 commits with all documentation and CLAUDE.md files

### What Was Completed This Session
1. **GitHub Infrastructure** - All labels created via gh CLI
2. **Issue Templates** - 4 templates in `.github/ISSUE_TEMPLATE/`
3. **Package CLAUDE.md Files** - 9 packages with LangChain best practices
4. **Daily Notes CLAUDE.md** - Format and session context guidelines
5. **Feature Documentation** - Features 011, 005, 012 added

### Next Session Tasks
1. **Push branch and create PR** for current work
2. **Update code-to-docs-sync-agent** to work with CLAUDE.md files
3. **Migrate ADRs** to GitHub Issues (16 ADRs total)
4. **Update root CLAUDE.md** with automatic session context
5. **Archive deprecated agents** to `.archive/` directory

### Quick Start for Next Session
```bash
# Check current branch
git status
git log --oneline -3

# Push branch and create PR
git push -u origin feat/github-issues-documentation-migration
gh pr create --title "feat: GitHub Issues documentation migration with package CLAUDE.md files" \
  --body "Implements Feature 011 - Migration to GitHub Issues with auto-loaded package context files"
```

## Notes

- Daily notes remain in Dendron for personal journaling
- Screenshot workflow unchanged
- Testing and code-review agents retained
- Visual-content-agent retained for blog generation
- PR creation workflow unchanged
- code-to-docs-sync-agent updated for CLAUDE.md synchronization