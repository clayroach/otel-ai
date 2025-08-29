# Config Manager Package

AI-powered self-healing configuration management that automatically fixes issues before they impact applications.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test:config-manager
```

## Key Features

- **Self-Healing Configuration**: AI automatically detects and fixes config issues
- **Drift Detection**: Monitors configuration changes and compliance violations
- **Policy Enforcement**: Ensures configurations follow organizational policies
- **Impact Analysis**: Predicts configuration change impacts before deployment
- **Effect-TS Integration**: Type-safe config operations with structured error handling

## Installation

```bash
pnpm install
```

## Basic Usage

```typescript
import { ConfigManager } from '@otel-ai/config-manager'

// Initialize manager
const configManager = ConfigManager.make({
  policies: './config-policies.yaml',
  healingEnabled: true
})

// Monitor configuration
const monitor = await configManager.startMonitoring({
  targets: ['k8s-cluster', 'otel-collector'],
  interval: '30s'
})

// Validate configuration
const result = await configManager.validateConfig(config)

// Auto-heal configuration
const healing = await configManager.autoHeal({
  issue: 'memory-leak-detected',
  service: 'otel-collector'
})
```

## API Overview

- `validateConfig()` - Validate configuration against policies
- `startMonitoring()` - Begin continuous configuration monitoring
- `autoHeal()` - Automatically fix detected configuration issues
- `analyzeImpact()` - Predict change impacts before deployment

## Documentation

For comprehensive documentation, policy definitions, and healing strategies, see:

📖 **[Config Manager Package Documentation](../../notes/packages/config-manager/package.md)**

## Configuration Policies

```yaml
# Example policy file
policies:
  - name: memory-limits
    rule: container.memory.limit > 0
    healing: set-default-limit
  - name: log-levels
    rule: log.level in ['debug', 'info', 'warn', 'error']
    healing: set-info-level
```

## Testing

```bash
# Unit tests
pnpm test

# Integration tests (requires k8s access)
pnpm test:integration
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for development workflow and config management patterns.