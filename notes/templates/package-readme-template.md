# Package Name

Brief description of what this package does and its primary purpose.

## Quick Start

```typescript
import { PackageService } from '@/package-name'

// Basic usage example
const service = PackageService.fromConfig(config)
const result = await service.operation(input)
```

## Installation

```bash
# If this were a standalone package
npm install @otel-ai/package-name
```

## Key Features

- **Feature 1**: Brief description
- **Feature 2**: Brief description  
- **Feature 3**: Brief description

## API Overview

### Core Classes/Services

- `PackageService` - Main service interface
- `PackageConfig` - Configuration interface
- `PackageTypes` - Core types and interfaces

### Essential Methods

```typescript
// Key method signatures
service.method(input: InputType): Effect<OutputType, ErrorType>
```

## Configuration

```typescript
interface PackageConfig {
  // Essential configuration options
  option1: string
  option2: number
}
```

## Testing

```bash
# Run unit tests
pnpm test src/package-name/test/unit/

# Run integration tests  
pnpm test src/package-name/test/integration/

# Run all package tests
pnpm test src/package-name/
```

## Documentation

For comprehensive documentation, architecture details, and design decisions, see:

- 📋 **[Package Specification](../notes/packages/package-name/package.md)** - Complete specifications and requirements
- 🏗️ **[Architecture Documentation](../notes/packages/package-name/architecture.md)** - Design and implementation details
- 📚 **[API Documentation](../notes/packages/package-name/api.md)** - Detailed API reference

## Dependencies

- Effect-TS for functional programming patterns
- OpenTelemetry for instrumentation
- [Other key dependencies]

## Development

This package follows the project's Effect-TS patterns and OpenTelemetry conventions. See [CLAUDE.md](../../CLAUDE.md) for development guidelines.

---

Part of the [otel-ai](../../README.md) AI-native observability platform.