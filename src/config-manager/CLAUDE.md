# Config Manager Package - Claude Context

## Package Overview
AI-powered self-healing configuration management with automatic detection and correction of misconfigurations. Manages platform settings, feature flags, and dynamic thresholds.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Schema validation required for all configuration changes
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Configuration changes must be auditable
- Use versioning for configuration schemas
- Implement rollback capability for all changes

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// Config Manager service definition
export interface ConfigManager extends Context.Tag<"ConfigManager", {
  readonly getConfig: <T>(key: string) => Effect.Effect<T, ConfigError, never>
  readonly setConfig: <T>(key: string, value: T) => Effect.Effect<void, ConfigError, never>
  readonly validateConfig: (config: unknown) => Effect.Effect<ConfigValidation, ConfigError, never>
  readonly healConfig: () => Effect.Effect<HealingReport, ConfigError, never>
  readonly rollback: (version: number) => Effect.Effect<void, ConfigError, never>
}>{}

export const ConfigManagerLive = Layer.effect(
  ConfigManager,
  Effect.gen(function* () {
    const storage = yield* Storage
    const llm = yield* LLMManager
    const validator = yield* ConfigValidator

    return ConfigManager.of({
      healConfig: () => Effect.gen(function* () {
        // Self-healing logic
      })
    })
  })
)
```

### Self-Healing Pattern
```typescript
// Detect and fix configuration issues
export const healConfiguration = () =>
  Effect.gen(function* () {
    // 1. Detect anomalies in current config
    const issues = yield* detectConfigIssues()

    // 2. Generate fixes using LLM
    const fixes = yield* Effect.forEach(issues, (issue) =>
      llm.queryWithSchema(
        {
          prompt: `Fix configuration issue: ${issue.description}`,
          systemPrompt: CONFIG_HEALING_PROMPT
        },
        ConfigFixSchema
      )
    )

    // 3. Validate proposed fixes
    const validatedFixes = yield* validateFixes(fixes)

    // 4. Apply fixes with rollback capability
    const transaction = yield* Effect.acquireUseRelease(
      createConfigTransaction(),
      (tx) => applyFixes(tx, validatedFixes),
      (tx, exit) => Exit.isFailure(exit) ? rollbackTransaction(tx) : commitTransaction(tx)
    )

    return {
      issuesFound: issues.length,
      fixesApplied: validatedFixes.length,
      status: 'healed'
    }
  })
```

### Configuration Schema Evolution
```typescript
// Version-aware schema handling
const ConfigSchemaV1 = Schema.Struct({
  version: Schema.Literal(1),
  settings: Schema.Struct({
    retention: Schema.Number,
    alertThreshold: Schema.Number
  })
})

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
  settings: {
    retention: { days: v1.settings.retention },
    alerting: { threshold: v1.settings.alertThreshold },
    features: defaultFeatures
  }
})
```

### Error Handling Pattern
```typescript
export type ConfigError =
  | { _tag: "ConfigNotFound"; key: string }
  | { _tag: "ValidationError"; errors: ReadonlyArray<string> }
  | { _tag: "HealingFailed"; reason: string }
  | { _tag: "RollbackFailed"; version: number; cause: unknown }
  | { _tag: "SchemaVersionMismatch"; expected: number; actual: number }
```

## API Contracts

### Config Manager Service Interface
```typescript
import { Context, Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'

// Main config service
export interface ConfigManager extends Context.Tag<"ConfigManager", {
  // Basic operations
  readonly getConfig: <T>(key: string) => Effect.Effect<T, ConfigError, never>
  readonly setConfig: <T>(key: string, value: T) => Effect.Effect<void, ConfigError, never>
  readonly deleteConfig: (key: string) => Effect.Effect<void, ConfigError, never>

  // Validation & healing
  readonly validateConfig: (config: unknown) => Effect.Effect<ValidationResult, ConfigError, never>
  readonly healConfig: () => Effect.Effect<HealingReport, ConfigError, never>
  readonly detectAnomalies: () => Effect.Effect<ReadonlyArray<ConfigAnomaly>, ConfigError, never>

  // Version management
  readonly getCurrentVersion: () => Effect.Effect<number, ConfigError, never>
  readonly rollback: (version: number) => Effect.Effect<void, ConfigError, never>
  readonly getHistory: () => Effect.Effect<ReadonlyArray<ConfigChange>, ConfigError, never>

  // Feature flags
  readonly getFeatureFlag: (flag: string) => Effect.Effect<boolean, ConfigError, never>
  readonly setFeatureFlag: (flag: string, enabled: boolean) => Effect.Effect<void, ConfigError, never>
}>{}

// Configuration schemas
export const PlatformConfigSchema = Schema.Struct({
  version: Schema.Number,
  storage: Schema.Struct({
    clickhouse: ClickhouseConfigSchema,
    s3: S3ConfigSchema,
    retention: RetentionConfigSchema
  }),
  services: Schema.Struct({
    aiAnalyzer: AIAnalyzerConfigSchema,
    llmManager: LLMConfigSchema,
    uiGenerator: UIGeneratorConfigSchema
  }),
  features: Schema.Record(Schema.String, Schema.Boolean),
  thresholds: Schema.Struct({
    anomaly: Schema.Number,
    alert: Schema.Number,
    rateLimit: Schema.Number
  })
})

export const ConfigChangeSchema = Schema.Struct({
  timestamp: Schema.Number,
  user: Schema.String,
  action: Schema.Literal("create", "update", "delete", "rollback"),
  key: Schema.String,
  previousValue: Schema.optional(Schema.Unknown),
  newValue: Schema.optional(Schema.Unknown),
  version: Schema.Number
})

export const HealingReportSchema = Schema.Struct({
  timestamp: Schema.Number,
  anomaliesDetected: Schema.Number,
  fixesApplied: Schema.Number,
  failures: Schema.Array(Schema.String),
  recommendations: Schema.Array(Schema.String)
})
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Modifying configuration without audit trail
- ❌ Not validating configuration before applying
- ❌ Missing rollback capability
- ❌ Hardcoding configuration values
- ❌ Not handling concurrent configuration updates
- ❌ Applying AI-suggested fixes without validation
- ❌ Not versioning configuration schemas
- ❌ Circular configuration dependencies

## Testing Requirements
- Unit tests: Mock configuration store
- Integration tests: Full configuration lifecycle
- Healing tests: Various misconfiguration scenarios
- Rollback tests: Version management validation
- Concurrency tests: Parallel configuration updates
- Test commands: `pnpm test:unit:config-manager`, `pnpm test:integration:config-manager`

## Performance Considerations

### Optimization Strategies
- Cache frequently accessed configurations
- Batch configuration updates
- Use optimistic locking for concurrent updates
- Implement configuration hot-reloading
- Minimize validation overhead with memoization

### Configuration Storage
```typescript
// Efficient configuration storage pattern
const configStore = {
  // In-memory cache with TTL
  cache: new Map<string, { value: unknown; expires: number }>(),

  // Persistent storage backend
  backend: ClickhouseConfigStore,

  // Change notification stream
  changes: Stream.asyncScoped<ConfigChange>()
}
```

### Feature Flag Evaluation
```typescript
// Fast feature flag evaluation
const featureFlags = {
  // Bitmap for boolean flags
  flags: new BitSet(),

  // Complex rules engine
  rules: new RulesEngine(),

  // A/B testing integration
  experiments: new ExperimentManager()
}
```

## Dependencies & References
- External:
  - `effect` ^3.11.0
  - `@effect/schema` ^0.78.0
  - `zod` ^3.23.0 (additional validation)
  - `js-yaml` ^4.1.0 (YAML config support)
- Internal:
  - Storage (configuration persistence)
  - LLM Manager (self-healing suggestions)
- Documentation:
  - Configuration Management: https://12factor.net/config
  - Feature Flags: https://martinfowler.com/articles/feature-toggles.html

## Quick Start Commands
```bash
# Development
pnpm dev:config-manager

# Testing
pnpm test:unit:config-manager
pnpm test:integration:config-manager

# Configuration validation
pnpm validate:config

# Building
pnpm build:config-manager

# Find active work
mcp__github__search_issues query:"package:config-manager is:open"
```