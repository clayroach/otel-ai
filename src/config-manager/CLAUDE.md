# Config Manager Package - Claude Context

## Package Overview
AI-powered self-healing configuration management with automatic detection and correction of misconfigurations.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no factory functions)
- External packages must use ConfigManagerLive Layer or create their own mock
- All async operations use Effect-TS with proper error handling
- Schema validation required for all configuration changes
- Tests go in test/unit/ and test/integration/ subdirectories
- Configuration changes must be auditable
- Use versioning for configuration schemas
- Implement rollback capability for all changes

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
export interface ConfigManager extends Context.Tag<"ConfigManager", {
  readonly getConfig: <T>(key: string) => Effect.Effect<T, ConfigError, never>
  readonly setConfig: <T>(key: string, value: T) => Effect.Effect<void, ConfigError, never>
  readonly validateConfig: (config: unknown) => Effect.Effect<ConfigValidation, ConfigError, never>
  readonly healConfig: () => Effect.Effect<HealingReport, ConfigError, never>
  readonly rollback: (version: number) => Effect.Effect<void, ConfigError, never>
}>{}
```

### Self-Healing Pattern
```typescript
// Detect and fix configuration issues
const healConfiguration = () =>
  Effect.gen(function* () {
    const issues = yield* detectConfigIssues()

    const fixes = yield* Effect.forEach(issues, (issue) =>
      llm.queryWithSchema(
        { prompt: `Fix config: ${issue}`, systemPrompt: HEALING_PROMPT },
        ConfigFixSchema
      )
    )

    const validatedFixes = yield* validateFixes(fixes)

    // Apply with transaction support
    yield* Effect.acquireUseRelease(
      createConfigTransaction(),
      (tx) => applyFixes(tx, validatedFixes),
      (tx, exit) => Exit.isFailure(exit) ? rollback(tx) : commit(tx)
    )
  })
```

### Schema Evolution Pattern
```typescript
// Version-aware schemas
const ConfigSchemaV2 = Schema.Struct({
  version: Schema.Literal(2),
  settings: Schema.Struct({
    retention: RetentionConfigSchema,
    alerting: AlertingConfigSchema,
    features: FeatureFlagsSchema
  })
})

// Migration function
const migrateV1ToV2 = (v1: ConfigV1): ConfigV2 => ({
  version: 2,
  settings: { /* mapped values */ }
})
```

## Known Issues & Workarounds

### Concurrent Updates
- **Problem**: Race conditions in config updates
- **Workaround**: Optimistic locking with version numbers
- **Fix**: Implement distributed locks (planned)

### Large Config Objects
- **Problem**: Memory issues with full config loading
- **Workaround**: Lazy loading with key paths
- **Fix**: Implement config streaming

## Common Pitfalls

❌ **DON'T**: Modify config without audit trail
❌ **DON'T**: Skip validation before applying
❌ **DON'T**: Miss rollback capability
❌ **DON'T**: Apply AI fixes without validation
❌ **DON'T**: Create circular dependencies

✅ **DO**: Version all config schemas
✅ **DO**: Validate before applying changes
✅ **DO**: Maintain complete audit logs
✅ **DO**: Test rollback scenarios
✅ **DO**: Cache frequently accessed configs

## Quick Command Reference

```bash
# Development
pnpm dev:config-manager

# Testing
pnpm test:unit:config-manager
pnpm test:integration:config-manager

# Validation
pnpm validate:config

# Find active work
mcp__github__search_issues query:"package:config-manager is:open"
```

## Dependencies & References
- `effect` ^3.11.0
- `@effect/schema` ^0.78.0
- `zod` ^3.23.0 (additional validation)
- `js-yaml` ^4.1.0 (YAML support)
- Storage package (persistence)
- LLM Manager (self-healing)
- Full documentation: See README.md