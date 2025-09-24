# AI Analyzer Package

Service topology analysis and AI-powered insights for telemetry data. Autoencoder-based anomaly detection and pattern recognition with real-time ML analysis using TensorFlow.js.

## Current Implementation Status

✅ **Complete**: Service topology mapping, AI-powered analysis, and comprehensive testing
🚀 **Future Enhancement**: Autoencoder anomaly detection for advanced ML capabilities

## Quick Start

```bash
# Install dependencies
pnpm add @otel-ai/ai-analyzer

# Set up environment
export TF_CPP_MIN_LOG_LEVEL=2  # Reduce TensorFlow logging
```

## Usage

### Basic Anomaly Detection

```typescript
import { AIAnalyzerClient, AIAnalyzerClientLive } from '@otel-ai/ai-analyzer'
import { Effect, Layer } from 'effect'

const program = Effect.gen(function* () {
  const analyzer = yield* AIAnalyzerClient

  // Detect anomalies in traces
  const report = yield* analyzer.detectAnomalies({
    timeRange: '1h',
    sensitivity: 0.95
  })

  // Get service topology
  const topology = yield* analyzer.getTopology({
    timeRange: '1h'
  })

  // AI-powered analysis
  const analysis = yield* analyzer.analyze({
    type: 'architecture',
    model: 'gpt-4',
    serviceName: 'frontend'
  })

  return { report, topology, analysis }
})

const main = program.pipe(Effect.provide(AIAnalyzerClientLive))
Effect.runPromise(main).then(console.log)
```

### Training Autoencoder Model

```typescript
import { trainAutoencoder } from '@otel-ai/ai-analyzer'

const model = await trainAutoencoder({
  dataset: historicalTraces,
  config: {
    epochs: 100,
    batchSize: 32,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch}: loss = ${logs.loss}`)
      }
    }
  }
})

// Save trained model
await model.save('file://./models/autoencoder')
```

### Streaming Analysis

```typescript
import { Stream } from 'effect'

const streamingAnalysis = Effect.gen(function* () {
  const analyzer = yield* AIAnalyzerClient

  // Create trace stream
  const traceStream = Stream.fromIterable(incomingTraces)

  // Real-time anomaly detection
  const anomalyStream = yield* analyzer.streamAnalysis(traceStream)

  // Process anomalies as they occur
  yield* Stream.runForEach(anomalyStream, (anomaly) =>
    Effect.sync(() => {
      console.log(`Anomaly detected: ${anomaly.service} - ${anomaly.severity}`)
      // Trigger alerts, update dashboards, etc.
    })
  )
})
```

## Key Features

- **Service Topology Mapping**: Automatic discovery and visualization of service dependencies
- **Multi-Model Analysis**: Support for GPT-4, Claude, SQLCoder for different analysis types
- **Autoencoder Anomaly Detection**: ML-based anomaly detection using reconstruction error
- **Pattern Recognition**: Identify periodic, burst, degradation, and correlation patterns
- **Real-time Streaming**: Process telemetry data in real-time with backpressure management
- **Architecture Insights**: AI-powered system architecture analysis
- **Performance Analysis**: Bottleneck detection and optimization recommendations
- **Effect-TS Integration**: Type-safe ML pipelines with structured error handling

## Architecture

### Service Layer Design

```typescript
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

  // Service topology
  readonly getTopology: (
    params: TopologyParams
  ) => Effect.Effect<ServiceTopology, AIError, never>

  // Model management
  readonly saveModel: (path: string) => Effect.Effect<void, AIError, never>
  readonly loadModel: (path: string) => Effect.Effect<void, AIError, never>
}>{}
```

### Autoencoder Architecture

The package uses a deep autoencoder for anomaly detection:

```typescript
const createAutoencoder = () => {
  const encoder = tf.sequential({
    layers: [
      tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      tf.layers.dense({ units: 16, activation: 'relu' }) // Latent space
    ]
  })

  const decoder = tf.sequential({
    layers: [
      tf.layers.dense({ units: 32, activation: 'relu', inputShape: [16] }),
      tf.layers.dropout({ rate: 0.2 }),
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

## API Reference

### Core Types

```typescript
interface AnomalyReport {
  timestamp: number
  anomalies: Array<{
    traceId: string
    service: string
    severity: "low" | "medium" | "high" | "critical"
    score: number
    description: string
  }>
  statistics: {
    totalAnalyzed: number
    anomaliesFound: number
    threshold: number
  }
}

interface Pattern {
  id: string
  type: "periodic" | "burst" | "degradation" | "correlation"
  services: string[]
  confidence: number
  timeRange: TimeRange
  metadata: Record<string, unknown>
}

interface TrainingData {
  traces: Trace[]
  labels?: boolean[] // For supervised learning
  config: {
    epochs: number
    batchSize: number
    validationSplit: number
  }
}

type AIError =
  | { _tag: "ModelNotTrained"; message: string }
  | { _tag: "InsufficientData"; required: number; provided: number }
  | { _tag: "PreprocessingError"; message: string }
  | { _tag: "TensorFlowError"; cause: unknown }
  | { _tag: "ThresholdCalculationError"; message: string }
```

### Service Methods

#### detectAnomalies
Analyzes traces for anomalies using autoencoder reconstruction error.

```typescript
const report = await analyzer.detectAnomalies({
  traces: recentTraces,
  threshold: 0.95 // 95th percentile
})
```

#### identifyPatterns
Identifies recurring patterns in telemetry data.

```typescript
const patterns = await analyzer.identifyPatterns({
  data: telemetryData,
  minConfidence: 0.8
})
```

#### trainModel
Trains the autoencoder on historical data.

```typescript
const metadata = await analyzer.trainModel({
  traces: historicalTraces,
  config: {
    epochs: 100,
    batchSize: 32,
    validationSplit: 0.2
  }
})
```

#### streamAnalysis
Performs real-time streaming analysis on incoming traces.

```typescript
const anomalyStream = analyzer.streamAnalysis(traceStream)
```

## Performance Optimization

### Model Configuration

```typescript
const optimalConfig = {
  inputDim: 128,        // Feature vector size
  encoderLayers: [64, 32, 16],  // Compression layers
  latentDim: 16,        // Bottleneck dimension
  decoderLayers: [32, 64, 128], // Reconstruction layers
  activation: 'relu',
  outputActivation: 'sigmoid',
  optimizer: 'adam',
  loss: 'meanSquaredError',
  metrics: ['accuracy']
}
```

### Memory Management

Always dispose tensors to prevent memory leaks:

```typescript
const processBatch = (batch: tf.Tensor) =>
  tf.tidy(() => {
    const result = model.predict(batch) as tf.Tensor
    return result.arraySync()
  })
```

### Batch Processing

Process large datasets in batches:

```typescript
const batchProcess = async (data: number[][], batchSize = 1000) => {
  const results = []

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    const tensor = tf.tensor2d(batch)

    const predictions = await model.predict(tensor).array()
    results.push(...predictions)

    tensor.dispose()
  }

  return results
}
```

### GPU Acceleration

Enable GPU acceleration for faster training:

```typescript
import '@tensorflow/tfjs-node-gpu'

// Verify GPU is available
console.log('GPU Available:', tf.env().get('WEBGL_VERSION'))
```

## Testing

### Unit Tests

```bash
# Run unit tests
pnpm test:unit:ai-analyzer

# With coverage
pnpm test:unit:ai-analyzer --coverage
```

### Integration Tests

```bash
# Requires trained models
pnpm test:integration:ai-analyzer

# Test specific features
pnpm test:integration:ai-analyzer --grep "anomaly detection"
```

### Performance Tests

```bash
# Benchmark model inference
pnpm test:perf:ai-analyzer
```

## Configuration

### Environment Variables

```bash
# TensorFlow Configuration
TF_CPP_MIN_LOG_LEVEL=2  # Reduce logging verbosity
TF_FORCE_GPU_ALLOW_GROWTH=true  # GPU memory management

# Model Configuration
MODEL_PATH=/path/to/saved/model
ANOMALY_THRESHOLD=0.95
BATCH_SIZE=32

# Service Configuration
AI_ANALYZER_PORT=8081
ENABLE_GPU=true
```

### Model Training Configuration

```typescript
const trainingConfig = {
  // Data preprocessing
  normalization: {
    method: 'minmax', // or 'zscore'
    featureRange: [0, 1]
  },

  // Model architecture
  architecture: {
    type: 'autoencoder',
    compression: 0.125, // 16/128
    dropout: 0.2
  },

  // Training parameters
  training: {
    epochs: 100,
    batchSize: 32,
    learningRate: 0.001,
    validationSplit: 0.2,
    earlyStopping: {
      patience: 10,
      monitor: 'val_loss'
    }
  },

  // Anomaly detection
  anomaly: {
    method: 'reconstruction_error',
    threshold: 'dynamic', // or fixed value
    percentile: 95
  }
}
```

## Troubleshooting

### Common Issues

#### Out of Memory Errors
- **Cause**: Tensors not being disposed
- **Solution**: Use tf.tidy() or manual dispose()
- **Prevention**: Enable memory profiling with `tf.profile()`

#### Poor Anomaly Detection
- **Cause**: Model undertrained or threshold too high/low
- **Solution**: Increase epochs, adjust threshold percentile
- **Prevention**: Use validation data to tune hyperparameters

#### Slow Inference
- **Cause**: Large batch sizes or CPU-only processing
- **Solution**: Reduce batch size, enable GPU acceleration
- **Prevention**: Profile performance with `tf.time()`

## Migration Guide

### From Statistical Methods

```typescript
// Before: Statistical anomaly detection
const isAnomaly = (value: number, mean: number, stdDev: number) => {
  return Math.abs(value - mean) > 3 * stdDev
}

// After: ML-based detection
const anomalyScore = await analyzer.getAnomalyScore(trace)
const isAnomaly = anomalyScore > threshold
```

### From Manual Pattern Detection

```typescript
// Before: Rule-based patterns
const detectPattern = (data: number[]) => {
  // Complex rules...
}

// After: ML pattern recognition
const patterns = await analyzer.identifyPatterns({
  data: telemetryData,
  minConfidence: 0.8
})
```

## Integration with Platform

The AI Analyzer integrates with:

- **Storage**: Retrieves historical traces for training
- **LLM Manager**: Generates explanations for detected anomalies
- **UI Generator**: Creates visualizations for anomaly reports
- **Server**: Provides real-time analysis endpoints

## Change Log

### 2025-09-15 - Complete Implementation
- Service topology mapping with dependency discovery
- Multi-model AI analysis (GPT-4, Claude, SQLCoder)
- Comprehensive testing suite
- Production-ready API client

### 2025-08-20 - Initial Design
- Autoencoder architecture specification
- TensorFlow.js integration planning
- Effect-TS service definitions

---

Part of the [otel-ai](../../README.md) AI-native observability platform.