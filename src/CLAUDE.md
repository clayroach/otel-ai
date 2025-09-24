# Package Structure Guidelines - Claude Context

## Overview
Meta documentation for maintaining consistent package structure across the otel-ai platform. Each package in src/ should have both README.md and CLAUDE.md files following specific patterns.
This file is automatically read by Claude Code when working in the src/ directory.

## Package Documentation Structure

Every package in `src/` MUST have:

### 1. README.md (Human Documentation)
Comprehensive package documentation for developers:
- **Length**: 300-500+ lines
- **Audience**: Human developers
- **Purpose**: Complete reference, API docs, examples, migration guides
- **Location**: `src/package-name/README.md`

### 2. CLAUDE.md (AI Context)
Lean context file for Claude Code:
- **Length**: 100-150 lines maximum
- **Audience**: Claude Code AI assistant
- **Purpose**: Critical patterns, conventions, pitfalls, quick commands
- **Location**: `src/package-name/CLAUDE.md`

## Required Structure for CLAUDE.md

All package CLAUDE.md files MUST include these 9 sections:

```markdown
# [Package Name] Package - Claude Context

## Package Overview
Brief 2-3 line description of package purpose and role.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- List of 5-7 critical rules
- Test organization requirements
- Effect-TS patterns
- Package-specific requirements

## Core Primitives & Patterns
Key code patterns with minimal examples (10-30 lines each)
- Service definitions
- Error handling patterns
- Critical abstractions

## Known Issues & Workarounds
Current problems with temporary solutions:
- **Problem**: Description
- **Workaround**: Current approach
- **Fix**: Long-term solution

## Common Pitfalls
❌ **DON'T**: Anti-patterns to avoid
✅ **DO**: Correct approaches

## Quick Command Reference
Essential commands for development and testing

## Dependencies & References
- Key dependencies with versions
- Links to full documentation
```

## Required Structure for README.md

All package README.md files MUST include:

```markdown
# [Package Name] Package

Comprehensive description of package functionality and purpose.

## Current Implementation Status
✅ **Complete**: What's fully implemented
🚧 **In Progress**: What's being worked on
📋 **Planned**: Future enhancements

## Quick Start
Installation and basic usage examples

## Usage
Multiple detailed usage examples with code

## Key Features
Bullet list of main capabilities

## Architecture
Technical design and implementation details

## API Reference
Complete API documentation with types

## Configuration
Environment variables and settings

## Testing
Test commands and strategies

## Performance
Benchmarks and optimization notes

## Troubleshooting
Common issues and solutions

## Migration Guide
How to migrate from other solutions

## Integration with Platform
How this package connects with others

## Change Log
Version history and breaking changes

---
Part of the [otel-ai](../../README.md) AI-native observability platform.
```

## Package Creation Workflow

When creating a new package:

1. **Create package structure**:
   ```bash
   mkdir -p src/new-package/test/{unit,integration,fixtures}
   mkdir -p src/new-package/src
   ```

2. **Create README.md first** (comprehensive docs)
3. **Create CLAUDE.md second** (AI context)
4. **Implement code** following patterns in CLAUDE.md
5. **Write tests** in test/ subdirectories

## Documentation Migration Process

When migrating from notes/packages/:

1. **Expand README.md** with content from notes/packages/[package]/package.md
2. **Slim CLAUDE.md** to 100-150 lines of essential context
3. **Delete notes/packages/[package]/** after migration
4. **Verify both files** follow required structures

## Test Organization Standards

ALL packages MUST follow:

```
src/package-name/
├── test/                    # ALL tests here
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Test data
├── src/                    # Implementation
├── README.md              # Human documentation
└── CLAUDE.md             # AI context
```

❌ **NEVER**: Create `*.test.ts` files in package root
✅ **ALWAYS**: Use `test/` subdirectories

## Effect-TS Service Pattern

All packages use this pattern:

```typescript
// Service definition
export interface ServiceName extends Context.Tag<"ServiceName", {
  readonly operation: (input: Input) => Effect.Effect<Output, Error, never>
}>{}

// Layer implementation
export const ServiceNameLive = Layer.effect(
  ServiceName,
  Effect.gen(function* () {
    // Implementation
  })
)
```

## Common Pitfalls to Avoid

❌ **DON'T**: Mix documentation between README and CLAUDE.md
❌ **DON'T**: Exceed 150 lines in CLAUDE.md
❌ **DON'T**: Put test files outside test/ directory
❌ **DON'T**: Skip either README.md or CLAUDE.md

✅ **DO**: Keep CLAUDE.md focused on AI assistance
✅ **DO**: Put comprehensive docs in README.md
✅ **DO**: Follow exact section structure
✅ **DO**: Update both files when making changes

## Quick Reference

### Check package documentation
```bash
# Verify both files exist
ls -la src/*/README.md src/*/CLAUDE.md

# Check CLAUDE.md line counts (should be <150)
wc -l src/*/CLAUDE.md

# Check README.md line counts (should be >300)
wc -l src/*/README.md
```

### Create new package docs
```bash
# Use Write tool to create both files
# Follow templates in this document
```

## Dependencies
- All packages use Effect-TS for service definitions
- All packages use @effect/schema for validation
- All packages follow OTLP conventions
- Full platform docs: See root README.md