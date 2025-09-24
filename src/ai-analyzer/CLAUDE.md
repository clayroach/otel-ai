# AI Analyzer Package - Claude Context

## Package Overview
Autoencoder-based anomaly detection and pattern recognition for telemetry data with real-time ML analysis.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no `createAIAnalyzerClient` functions)
- External packages must use AIAnalyzerLive Layer or create their own mock
- All async operations use Effect-TS with proper error handling
- Schema validation required for all telemetry inputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Use TensorFlow.js for autoencoder implementation
- Always dispose tensors after use to prevent memory leaks
- Stream processing for real-time analysis

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
export interface AIAnalyzer extends Context.Tag<"AIAnalyzer", {
  readonly detectAnomalies: (traces: ReadonlyArray<Trace>) => Effect.Effect<AnomalyReport, AIError, never>
  readonly trainModel: (dataset: TrainingData) => Effect.Effect<Model, AIError, never>
  readonly streamAnalysis: (input: Stream.Stream<Trace>) => Stream.Stream<Anomaly, AIError, never>
}>{}
```

### Autoencoder Architecture
```typescript
// Optimal configuration for anomaly detection
const modelConfig = {
  inputDim: 128,  // Feature vector size
  encoderLayers: [64, 32, 16],  // Compression
  latentDim: 16,  // Bottleneck
  decoderLayers: [32, 64, 128],  // Reconstruction
  activation: 'relu',
  loss: 'meanSquaredError'
}

// Create autoencoder
const encoder = tf.sequential({
  layers: [
    tf.layers.dense({ units: 64, activation: 'relu', inputShape: [128] }),
    tf.layers.dense({ units: 32, activation: 'relu' }),
    tf.layers.dense({ units: 16, activation: 'relu' })
  ]
})
```

### Anomaly Detection Pattern
```typescript
// Detect using reconstruction error
const detectAnomalies = (traces: Trace[], model: tf.LayersModel) =>
  Effect.gen(function* () {
    const features = yield* preprocessTraces(traces)
    const predictions = model.predict(features) as tf.Tensor
    const errors = tf.losses.meanSquaredError(features, predictions)
    const threshold = yield* calculateDynamicThreshold(errors)

    // Clean up tensors
    features.dispose()
    predictions.dispose()
    errors.dispose()

    return { anomalies, threshold, scores }
  })
```

## Known Issues & Workarounds

### TensorFlow Memory Leaks
- **Problem**: Tensors not disposed causing OOM
- **Workaround**: Always use tf.tidy() or manual dispose()
- **Fix**: Implement automatic tensor tracking

### Large Dataset Processing
- **Problem**: Loading entire dataset crashes Node.js
- **Workaround**: Use tf.data.generator() for streaming
- **Fix**: Implement batch processing pipeline

## Common Pitfalls

❌ **DON'T**: Train on unnormalized data
❌ **DON'T**: Use fixed anomaly thresholds
❌ **DON'T**: Load entire datasets into memory
❌ **DON'T**: Forget to dispose tensors
❌ **DON'T**: Block during model inference

✅ **DO**: Normalize all features before training
✅ **DO**: Use dynamic percentile-based thresholds
✅ **DO**: Stream data in batches
✅ **DO**: Use tf.tidy() for automatic cleanup
✅ **DO**: Use async/Effect for all operations

## Quick Command Reference

```bash
# Development
pnpm dev:ai-analyzer

# Testing
pnpm test:unit:ai-analyzer
pnpm test:integration:ai-analyzer

# Training
pnpm train:model

# Find active work
mcp__github__search_issues query:"package:ai-analyzer is:open"
```

## Dependencies & References
- `@tensorflow/tfjs` ^4.20.0
- `@tensorflow/tfjs-node` ^4.20.0 (server-side)
- `effect` ^3.11.0
- `@effect/schema` ^0.78.0
- Storage package (for telemetry data)
- Full documentation: See README.md
- TensorFlow.js Guide: https://www.tensorflow.org/js/guide