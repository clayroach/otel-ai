# AI Analyzer Package - Claude Context

## Package Overview
Autoencoder-based anomaly detection and pattern recognition for telemetry data. Real-time analysis of traces, metrics, and logs with ML-powered insights.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Schema validation required for all telemetry inputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Use TensorFlow.js for autoencoder implementation
- Stream processing for real-time analysis
- Batch processing for training operations

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// AI Analyzer service definition
export interface AIAnalyzer extends Context.Tag<"AIAnalyzer", {
  readonly detectAnomalies: (traces: ReadonlyArray<Trace>) => Effect.Effect<AnomalyReport, AIError, never>
  readonly trainModel: (dataset: TrainingData) => Effect.Effect<Model, AIError, never>
  readonly analyzePattern: (data: TelemetryData) => Effect.Effect<Pattern, AIError, never>
  readonly streamAnalysis: (input: Stream.Stream<Trace>) => Stream.Stream<Anomaly, AIError, never>
}>{}

export const AIAnalyzerLive = Layer.effect(
  AIAnalyzer,
  Effect.gen(function* () {
    const storage = yield* Storage
    const model = yield* loadOrCreateModel()

    return AIAnalyzer.of({
      detectAnomalies: (traces) => Effect.gen(function* () {
        // Autoencoder-based detection
      })
    })
  })
)
```

### Autoencoder Pattern
```typescript
// Autoencoder architecture for anomaly detection
const createAutoencoder = () => {
  const encoder = tf.sequential({
    layers: [
      tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      tf.layers.dense({ units: 16, activation: 'relu' }) // Latent space
    ]
  })

  const decoder = tf.sequential({
    layers: [
      tf.layers.dense({ units: 32, activation: 'relu', inputShape: [16] }),
      tf.layers.dense({ units: 64, activation: 'relu' }),
      tf.layers.dense({ units: inputDim, activation: 'sigmoid' })
    ]
  })

  return tf.model({
    inputs: encoder.inputs,
    outputs: decoder(encoder.outputs)
  })
}
```

### Anomaly Detection Pattern
```typescript
// Detect anomalies using reconstruction error
export const detectAnomalies = (traces: ReadonlyArray<Trace>, model: tf.LayersModel) =>
  Effect.gen(function* () {
    // Preprocess traces to feature vectors
    const features = yield* preprocessTraces(traces)

    // Get predictions and reconstruction errors
    const predictions = model.predict(features) as tf.Tensor
    const errors = tf.losses.meanSquaredError(features, predictions)

    // Calculate threshold (e.g., 95th percentile)
    const threshold = yield* calculateDynamicThreshold(errors)

    // Identify anomalies
    const anomalyIndices = yield* findAnomalousIndices(errors, threshold)

    return {
      anomalies: anomalyIndices.map(i => traces[i]),
      threshold,
      scores: Array.from(errors.dataSync())
    }
  })
```

### Error Handling Pattern
```typescript
export type AIError =
  | { _tag: "ModelNotTrained"; message: string }
  | { _tag: "InsufficientData"; required: number; provided: number }
  | { _tag: "PreprocessingError"; message: string }
  | { _tag: "TensorFlowError"; cause: unknown }
  | { _tag: "ThresholdCalculationError"; message: string }
```

## API Contracts

### AI Analyzer Service Interface
```typescript
import { Context, Effect, Layer, Stream } from 'effect'
import { Schema } from '@effect/schema'
import * as tf from '@tensorflow/tfjs'

// Main AI analyzer service
export interface AIAnalyzer extends Context.Tag<"AIAnalyzer", {
  // Anomaly detection
  readonly detectAnomalies: (
    traces: ReadonlyArray<Trace>
  ) => Effect.Effect<AnomalyReport, AIError, never>

  // Pattern recognition
  readonly identifyPatterns: (
    data: TelemetryData
  ) => Effect.Effect<ReadonlyArray<Pattern>, AIError, never>

  // Model training
  readonly trainModel: (
    dataset: TrainingData
  ) => Effect.Effect<ModelMetadata, AIError, never>

  // Real-time streaming analysis
  readonly streamAnalysis: (
    input: Stream.Stream<Trace>
  ) => Stream.Stream<AnomalyEvent, AIError, never>

  // Model management
  readonly saveModel: (path: string) => Effect.Effect<void, AIError, never>
  readonly loadModel: (path: string) => Effect.Effect<void, AIError, never>
}>{}

// Schemas for validation
export const AnomalyReportSchema = Schema.Struct({
  timestamp: Schema.Number,
  anomalies: Schema.Array(Schema.Struct({
    traceId: Schema.String,
    service: Schema.String,
    severity: Schema.Literal("low", "medium", "high", "critical"),
    score: Schema.Number,
    description: Schema.String
  })),
  statistics: Schema.Struct({
    totalAnalyzed: Schema.Number,
    anomaliesFound: Schema.Number,
    threshold: Schema.Number
  })
})

export const PatternSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("periodic", "burst", "degradation", "correlation"),
  services: Schema.Array(Schema.String),
  confidence: Schema.Number,
  timeRange: TimeRangeSchema,
  metadata: Schema.Record(Schema.String, Schema.Unknown)
})

export const TrainingDataSchema = Schema.Struct({
  traces: Schema.Array(TraceSchema),
  labels: Schema.optional(Schema.Array(Schema.Boolean)), // For supervised learning
  config: Schema.Struct({
    epochs: Schema.Number,
    batchSize: Schema.Number,
    validationSplit: Schema.Number
  })
})
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Training on unnormalized data (always normalize features)
- ❌ Fixed anomaly thresholds (use dynamic percentile-based)
- ❌ Loading entire datasets into memory (use batching)
- ❌ Not handling TensorFlow memory leaks (dispose tensors)
- ❌ Blocking operations during model inference (use async)
- ❌ Missing data validation before model input
- ❌ Not saving model checkpoints during training
- ❌ Using single model for all anomaly types

## Testing Requirements
- Unit tests: Mock TensorFlow operations
- Integration tests: Small dataset training validation
- Performance tests: Measure inference time for 10K traces
- Memory tests: Validate no tensor leaks
- Streaming tests: Real-time analysis pipeline
- Test commands: `pnpm test:unit:ai-analyzer`, `pnpm test:integration:ai-analyzer`

## Performance Considerations

### Optimization Strategies
- Batch inference for better GPU utilization
- Feature caching for frequently analyzed services
- Model quantization for faster inference
- Sliding window for streaming analysis
- Parallel processing for independent services

### Model Architecture
```typescript
// Optimal autoencoder configuration
const modelConfig = {
  inputDim: 128,  // Feature vector size
  encoderLayers: [64, 32, 16],  // Compression layers
  latentDim: 16,  // Bottleneck dimension
  decoderLayers: [32, 64, 128],  // Reconstruction layers
  activation: 'relu',
  outputActivation: 'sigmoid',
  optimizer: 'adam',
  loss: 'meanSquaredError'
}
```

### Memory Management
```typescript
// Always dispose tensors after use
const processBatch = (batch: tf.Tensor) =>
  Effect.try(() => {
    const result = model.predict(batch) as tf.Tensor
    const data = result.arraySync()
    batch.dispose()
    result.dispose()
    return data
  })
```

## Dependencies & References
- External:
  - `@tensorflow/tfjs` ^4.20.0
  - `@tensorflow/tfjs-node` ^4.20.0 (for server-side)
  - `effect` ^3.11.0
  - `@effect/schema` ^0.78.0
- Internal:
  - Storage package (for telemetry data)
  - LLM Manager (for anomaly explanations)
- Documentation:
  - TensorFlow.js Guide: https://www.tensorflow.org/js/guide
  - Autoencoder Theory: https://www.tensorflow.org/tutorials/generative/autoencoder

## Quick Start Commands
```bash
# Development
pnpm dev:ai-analyzer

# Testing
pnpm test:unit:ai-analyzer
pnpm test:integration:ai-analyzer

# Training
pnpm train:model

# Building
pnpm build:ai-analyzer

# Find active work
mcp__github__search_issues query:"package:ai-analyzer is:open"
```