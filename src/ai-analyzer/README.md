# AI Analyzer Package

Service topology analysis and AI-powered insights for telemetry data. Provides comprehensive analysis capabilities with potential for future autoencoder enhancement.

## Implementation Status

✅ **FULLY IMPLEMENTED** - Complete topology analysis, service dependency mapping, and AI-powered insights working in production.

### Current Features
- **Service Topology Mapping**: Automatic discovery and visualization of service dependencies
- **Multi-Model Analysis**: Support for GPT-4, Claude, SQLCoder for different analysis types
- **Architecture Insights**: AI-powered system architecture analysis
- **Performance Analysis**: Bottleneck detection and optimization recommendations
- **API Client**: Full Effect-TS based client with proper error handling
- **Comprehensive Testing**: Unit and integration tests with high coverage

### Future Enhancement (Not Required for MVP)
- **Autoencoder Anomaly Detection**: Would fill ClickHouse's anomaly detection gap
- **Pattern Recognition**: Advanced ML models for pattern identification
- **Model Training Pipeline**: Automated model updates

## Quick Start

```typescript
import { AIAnalyzerClient, AIAnalyzerClientLive } from '@otel-ai/ai-analyzer'
import { Effect, Layer } from 'effect'

// Create AI analyzer client
const program = Effect.gen(function* () {
  const client = yield* AIAnalyzerClient
  
  // Get service topology
  const topology = yield* client.getTopology({
    timeRange: '1h'
  })
  
  // Analyze system architecture
  const analysis = yield* client.analyze({
    type: 'architecture',
    model: 'gpt-4',
    serviceName: 'frontend'
  })
  
  return { topology, analysis }
})

// Run with live implementation
const main = program.pipe(
  Effect.provide(AIAnalyzerClientLive)
)
```

## Key Features

- **Service Topology Mapping**: Automatic discovery of service dependencies
- **Multi-Model Analysis**: Support for GPT-4, Claude, SQLCoder for different analysis types
- **Architecture Insights**: AI-powered system architecture analysis
- **Performance Analysis**: Bottleneck detection and optimization recommendations
- **Test Coverage**: Comprehensive unit and integration tests
- **Effect-TS Integration**: Type-safe ML pipelines with structured error handling

## Installation

```bash
pnpm install
```

## Basic Usage

```typescript
import { AIAnalyzer } from '@otel-ai/ai-analyzer'

// Initialize analyzer
const analyzer = AIAnalyzer.make({
  model: 'autoencoder',
  threshold: 0.95
})

// Analyze traces for anomalies
const results = await analyzer.analyzeTraces(traces)

// Get anomaly score
const score = await analyzer.getAnomalyScore(trace)
```

## API Overview

- `analyzeTraces()` - Real-time trace anomaly detection
- `trainModel()` - Train autoencoder on historical data
- `getAnomalyScore()` - Calculate anomaly score for individual traces
- `detectPatterns()` - Identify recurring patterns in telemetry

## Documentation

For comprehensive documentation, ML model specifications, and training procedures, see:

📖 **[AI Analyzer Package Documentation](../../notes/packages/ai-analyzer/package.md)**

## Testing

```bash
# Unit tests
pnpm test

# Integration tests (requires trained models)
pnpm test:integration
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for development workflow and AI-native patterns.