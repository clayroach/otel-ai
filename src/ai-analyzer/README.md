# AI Analyzer Package

Real-time anomaly detection and pattern recognition for telemetry data using autoencoders and machine learning.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test:ai-analyzer
```

## Key Features

- **Autoencoder Anomaly Detection**: Deep learning models for identifying unusual patterns
- **Real-time Processing**: Stream-based analysis with backpressure handling
- **Multi-model Support**: Different models for traces, metrics, and logs
- **Pattern Recognition**: Intelligent clustering and classification
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
pnpm test:unit

# Integration tests (requires trained models)
pnpm test:integration
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for development workflow and AI-native patterns.