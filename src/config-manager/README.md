# Config Manager Package

AI-powered self-healing configuration management with automatic detection and correction of misconfigurations. Manages platform settings, feature flags, and dynamic thresholds with full audit trail and rollback capability.

## Current Implementation Status

📋 **Specification Only** - This package is designed but not yet implemented. Comprehensive specification available for future development.

## Quick Start

```bash
# Install dependencies (when implemented)
pnpm add @otel-ai/config-manager

# Set up environment
export CONFIG_STORE_PATH=/var/lib/otel-ai/config
export ENABLE_SELF_HEALING=true
```

## Usage

### Basic Configuration Management

```typescript
import { ConfigManagerClient, ConfigManagerLive } from '@otel-ai/config-manager'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const config = yield* ConfigManagerClient

  // Get configuration
  const settings = yield* config.getConfig('platform.settings')

  // Set configuration with validation
  yield* config.setConfig('platform.thresholds.anomaly', 0.95)

  // Validate configuration
  const validation = yield* config.validateConfig(newConfig)

  // Self-healing
  const healingReport = yield* config.healConfig()

  return { settings, validation, healingReport }
})

const main = program.pipe(Effect.provide(ConfigManagerLive))
Effect.runPromise(main).then(console.log)
```

### Self-Healing Configuration

```typescript
const selfHealingProgram = Effect.gen(function* () {
  const config = yield* ConfigManagerClient

  // Detect configuration anomalies
  const anomalies = yield* config.detectAnomalies()

  // Automatic healing with AI assistance
  const healingReport = yield* config.healConfig()

  // Review healing actions
  console.log(`Fixed ${healingReport.fixesApplied} issues`)
  console.log('Recommendations:', healingReport.recommendations)

  return healingReport
})
```

### Feature Flag Management

```typescript
const featureFlagProgram = Effect.gen(function* () {
  const config = yield* ConfigManagerClient

  // Check feature flag
  const isEnabled = yield* config.getFeatureFlag('new-ui-dashboard')

  // Enable feature for percentage of users
  yield* config.setFeatureFlag('new-ui-dashboard', {
    enabled: true,
    rollout: {
      percentage: 25,
      targeting: {
        users: ['beta-testers'],
        excludeUsers: ['production-critical']
      }
    }
  })

  // A/B testing configuration
  yield* config.configureExperiment('ui-experiment', {
    control: { flag: 'old-ui', weight: 50 },
    treatment: { flag: 'new-ui', weight: 50 }
  })
})
```

### Configuration Versioning & Rollback

```typescript
const versionManagement = Effect.gen(function* () {
  const config = yield* ConfigManagerClient

  // Get current version
  const currentVersion = yield* config.getCurrentVersion()

  // Get configuration history
  const history = yield* config.getHistory()

  // Rollback to previous version
  if (deploymentFailed) {
    yield* config.rollback(currentVersion - 1)
  }

  // Create configuration snapshot
  yield* config.createSnapshot('pre-deployment')
})
```

## Key Features

- **Self-Healing Configuration**: AI automatically detects and fixes config issues
- **Drift Detection**: Monitors configuration changes and compliance violations
- **Policy Enforcement**: Ensures configurations follow organizational policies
- **Impact Analysis**: Predicts configuration change impacts before deployment
- **Version Management**: Complete history with rollback capability
- **Feature Flags**: Advanced targeting and A/B testing support
- **Audit Trail**: Complete logging of all configuration changes
- **Schema Evolution**: Automatic migration between config versions
- **Effect-TS Integration**: Type-safe config operations with structured error handling

## Architecture

### Service Layer Design

```typescript
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
  readonly createSnapshot: (name: string) => Effect.Effect<void, ConfigError, never>

  // Feature flags
  readonly getFeatureFlag: (flag: string) => Effect.Effect<boolean, ConfigError, never>
  readonly setFeatureFlag: (flag: string, config: FeatureFlagConfig) => Effect.Effect<void, ConfigError, never>
  readonly configureExperiment: (name: string, config: ExperimentConfig) => Effect.Effect<void, ConfigError, never>
}>{}
```

### Configuration Schema

```typescript
const PlatformConfigSchema = Schema.Struct({
  version: Schema.Number,
  storage: Schema.Struct({
    clickhouse: Schema.Struct({
      host: Schema.String,
      port: Schema.Number,
      database: Schema.String,
      username: Schema.String,
      password: Schema.String
    }),
    s3: Schema.Struct({
      bucket: Schema.String,
      region: Schema.String,
      endpoint: Schema.optional(Schema.String)
    }),
    retention: Schema.Struct({
      traces: Schema.Number,
      metrics: Schema.Number,
      logs: Schema.Number
    })
  }),
  services: Schema.Struct({
    aiAnalyzer: Schema.Struct({
      modelPath: Schema.String,
      anomalyThreshold: Schema.Number,
      batchSize: Schema.Number
    }),
    llmManager: Schema.Struct({
      provider: Schema.Literal('openai', 'anthropic', 'local'),
      apiKey: Schema.optional(Schema.String),
      model: Schema.String,
      maxTokens: Schema.Number
    }),
    uiGenerator: Schema.Struct({
      framework: Schema.Literal('react', 'vue', 'svelte'),
      chartLibrary: Schema.Literal('echarts', 'd3', 'chartjs'),
      theme: Schema.String
    })
  }),
  features: Schema.Record(Schema.String, Schema.Boolean),
  thresholds: Schema.Struct({
    anomaly: Schema.Number,
    alert: Schema.Number,
    rateLimit: Schema.Number
  })
})
```

## API Reference

### Core Types

```typescript
interface ConfigChange {
  timestamp: number
  user: string
  action: "create" | "update" | "delete" | "rollback"
  key: string
  previousValue?: unknown
  newValue?: unknown
  version: number
}

interface HealingReport {
  timestamp: number
  anomaliesDetected: number
  fixesApplied: number
  failures: string[]
  recommendations: string[]
}

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions: string[]
}

interface FeatureFlagConfig {
  enabled: boolean
  rollout?: {
    percentage: number
    targeting?: {
      users?: string[]
      excludeUsers?: string[]
      attributes?: Record<string, unknown>
    }
  }
  metadata?: Record<string, unknown>
}

type ConfigError =
  | { _tag: "ConfigNotFound"; key: string }
  | { _tag: "ValidationError"; errors: ReadonlyArray<string> }
  | { _tag: "HealingFailed"; reason: string }
  | { _tag: "RollbackFailed"; version: number; cause: unknown }
  | { _tag: "SchemaVersionMismatch"; expected: number; actual: number }
```

### Service Methods

#### getConfig
Retrieves configuration value by key path.

```typescript
const dbConfig = await config.getConfig('storage.clickhouse')
```

#### setConfig
Sets configuration value with validation.

```typescript
await config.setConfig('thresholds.anomaly', 0.95)
```

#### validateConfig
Validates configuration against schema and policies.

```typescript
const result = await config.validateConfig(newConfig)
if (!result.valid) {
  console.error('Validation errors:', result.errors)
}
```

#### healConfig
Automatically detects and fixes configuration issues.

```typescript
const report = await config.healConfig()
console.log(`Fixed ${report.fixesApplied} configuration issues`)
```

#### rollback
Reverts configuration to a previous version.

```typescript
await config.rollback(previousVersion)
```

## Configuration Policies

Define policies to enforce configuration standards:

```yaml
# config-policies.yaml
policies:
  - name: memory-limits
    description: Ensure all services have memory limits
    rule: |
      service.memory.limit > 0 &&
      service.memory.limit <= 8192
    severity: error
    healing:
      action: set-default-limit
      value: 512

  - name: log-retention
    description: Log retention must be between 1-30 days
    rule: |
      storage.retention.logs >= 1 &&
      storage.retention.logs <= 30
    severity: warning
    healing:
      action: clamp-value
      min: 1
      max: 30

  - name: feature-flag-rollout
    description: New features must use gradual rollout
    rule: |
      features.*.rollout.percentage <= 50
    severity: info
    healing:
      action: suggest-rollout-plan
```

## Performance Optimization

### Configuration Caching

```typescript
const cacheConfig = {
  // In-memory cache with TTL
  cache: new Map<string, { value: unknown; expires: number }>(),
  ttl: 300, // 5 minutes

  // Hot-reload support
  watchChanges: true,

  // Prefetch common configs
  prefetchKeys: [
    'platform.settings',
    'features.*',
    'thresholds.*'
  ]
}
```

### Feature Flag Evaluation

```typescript
// Optimized feature flag evaluation
const featureFlagOptimization = {
  // Bitmap for boolean flags
  useBitmap: true,

  // Cache evaluation results
  cacheResults: true,
  cacheTTL: 60, // 1 minute

  // Batch API calls
  batchSize: 100,

  // Local evaluation
  evaluateLocally: true
}
```

## Testing

### Unit Tests

```bash
# Run unit tests
pnpm test:unit:config-manager

# Test specific features
pnpm test:unit:config-manager --grep "self-healing"
```

### Integration Tests

```bash
# Requires storage backend
pnpm test:integration:config-manager

# Test rollback scenarios
pnpm test:integration:config-manager --grep "rollback"
```

### Policy Tests

```bash
# Test policy enforcement
pnpm test:policies
```

## Configuration

### Environment Variables

```bash
# Storage Configuration
CONFIG_STORE_PATH=/var/lib/otel-ai/config
CONFIG_STORE_TYPE=clickhouse # or 'file', 'redis'

# Self-Healing Configuration
ENABLE_SELF_HEALING=true
HEALING_INTERVAL=300 # seconds
HEALING_DRY_RUN=false

# Feature Flags
FEATURE_FLAG_PROVIDER=launchdarkly # or 'internal'
FEATURE_FLAG_SDK_KEY=sdk-key

# Policy Enforcement
POLICY_FILE_PATH=./config-policies.yaml
ENFORCE_POLICIES=true
POLICY_VIOLATION_ACTION=block # or 'warn', 'heal'
```

### Schema Evolution

Handle configuration schema changes gracefully:

```typescript
// Schema versioning
const schemaVersions = {
  v1: ConfigSchemaV1,
  v2: ConfigSchemaV2,
  v3: ConfigSchemaV3
}

// Migration functions
const migrations = {
  '1->2': migrateV1ToV2,
  '2->3': migrateV2ToV3
}

// Automatic migration
const migrateConfig = async (config: unknown) => {
  const version = detectVersion(config)
  const targetVersion = getCurrentSchemaVersion()

  let migrated = config
  for (let v = version; v < targetVersion; v++) {
    const migrationKey = `${v}->${v + 1}`
    migrated = await migrations[migrationKey](migrated)
  }

  return migrated
}
```

## Troubleshooting

### Common Issues

#### Configuration Drift
- **Cause**: Manual changes outside config manager
- **Solution**: Enable drift detection and auto-correction
- **Prevention**: Enforce all changes through API

#### Healing Loop
- **Cause**: Conflicting policies or invalid healing actions
- **Solution**: Review policy definitions, enable dry-run mode
- **Prevention**: Test policies in staging environment

#### Rollback Failure
- **Cause**: Missing version history or corrupted snapshot
- **Solution**: Restore from backup, rebuild version chain
- **Prevention**: Regular backup of configuration store

## Migration Guide

### From Static Configuration

```typescript
// Before: Static YAML files
const config = loadYaml('./config.yaml')

// After: Dynamic config manager
const config = await configManager.getConfig('platform')
```

### From Environment Variables

```typescript
// Before: Process env
const dbHost = process.env.DB_HOST

// After: Structured config
const dbConfig = await configManager.getConfig('storage.clickhouse')
const dbHost = dbConfig.host
```

## Integration with Platform

The Config Manager integrates with:

- **Storage**: Persists configuration history and snapshots
- **LLM Manager**: Provides AI-powered healing suggestions
- **AI Analyzer**: Detects configuration anomalies
- **Server**: Exposes configuration API endpoints

## Change Log

### 2025-08-14 - Specification Design
- Complete API specification
- Self-healing architecture design
- Policy engine specification
- Feature flag management design

---

Part of the [otel-ai](../../README.md) AI-native observability platform.