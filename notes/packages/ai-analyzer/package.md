---
id: packages.ai-analyzer
title: AI Analyzer Package
desc: 'Core AI analysis engine with autoencoders and pattern recognition'
updated: 2025-08-13
created: 2025-08-13
---

# AI Analyzer Package

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the ai-analyzer package -->

### Purpose

Core AI analysis engine that continuously analyzes telemetry data using autoencoders for anomaly detection and pattern recognition. **NEW**: Provides unified analysis across dual ingestion paths (OTel Collector + Direct OTLP) through schema harmonization. Delivers real-time analysis capabilities and daily batch processing for evolving pattern detection. This is the brain of the AI-native observability platform.

### Architecture

- **Unified Processing Layer**: Schema harmonization across OTLP native (`otel_traces`) and custom (`traces`) schemas
- **Cross-Path Analysis Engine**: AI analysis that works on both ingestion paths simultaneously
- **Autoencoder Engine**: Neural networks for anomaly detection and pattern learning
- **Real-Time Processor**: Stream processing for immediate anomaly detection across all data sources
- **Batch Processor**: Daily analysis for pattern evolution and model updates
- **Pattern Library**: Repository of learned patterns and their characteristics
- **Ingestion Path Analytics**: Unique capability to analyze differences between collector vs direct ingestion

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces

```typescript
import { Effect, Context, Layer, Stream, Schedule } from 'effect'
import { Schema } from '@effect/schema'

// Effect-TS Schema definitions for AI analysis with unified processing
const AnalysisConfigSchema = Schema.Struct({
  autoencoders: Schema.Struct({
    traces: AutoencoderConfigSchema,
    metrics: AutoencoderConfigSchema,
    logs: AutoencoderConfigSchema
  }),
  realtime: Schema.Struct({
    windowSize: Schema.Number, // seconds
    threshold: Schema.Number, // anomaly score threshold
    batchSize: Schema.Number
  }),
  batch: Schema.Struct({
    schedule: Schema.String, // cron expression
    retentionDays: Schema.Number,
    modelUpdateFrequency: Schema.Number // days
  }),
  unified: Schema.Struct({
    enableCrossPathAnalysis: Schema.Boolean,
    ingestionPathWeighting: Schema.Struct({
      collector: Schema.Number, // 0.0-1.0 weight for collector path
      direct: Schema.Number     // 0.0-1.0 weight for direct path
    }),
    schemaHarmonization: Schema.Boolean,
    crossPathCorrelationThreshold: Schema.Number
  })
})

const AutoencoderConfigSchema = Schema.Struct({
  inputDim: Schema.Number,
  hiddenLayers: Schema.Array(Schema.Number),
  learningRate: Schema.Number,
  epochs: Schema.Number,
  threshold: Schema.Number
})

const AnomalyResultSchema = Schema.Struct({
  timestamp: Schema.Number,
  type: Schema.Literal('trace', 'metric', 'log'),
  score: Schema.Number,
  threshold: Schema.Number,
  data: Schema.Unknown,
  context: AnomalyContextSchema,
  confidence: Schema.Number,
  recommendations: Schema.optional(Schema.Array(Schema.String)),
  // NEW: Unified processing fields
  ingestionPath: Schema.Literal('collector', 'direct', 'unified'),
  schemaVersion: Schema.String,
  crossPathCorrelation: Schema.optional(CrossPathCorrelationSchema)
})

const AnomalyContextSchema = Schema.Struct({
  serviceNames: Schema.Array(Schema.String),
  operations: Schema.Array(Schema.String),
  timeWindow: Schema.String,
  correlatedAnomalies: Schema.Array(Schema.String),
  historicalComparison: HistoricalDataSchema,
  // NEW: Cross-path context
  ingestionPathDistribution: Schema.Record(Schema.String, Schema.Number),
  schemaCompatibility: Schema.Boolean
})

const CrossPathCorrelationSchema = Schema.Struct({
  collectorPathScore: Schema.Number,
  directPathScore: Schema.Number,
  correlationStrength: Schema.Number,
  pathDivergence: Schema.Number,
  recommendedIngestionPath: Schema.Literal('collector', 'direct', 'either')
})

const PatternResultSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal('performance', 'error', 'usage', 'infrastructure'),
  pattern: Schema.String,
  confidence: Schema.Number,
  frequency: Schema.Number,
  impact: Schema.Literal('low', 'medium', 'high', 'critical'),
  firstSeen: Schema.Number,
  lastSeen: Schema.Number,
  examples: Schema.Array(Schema.Unknown)
})

type AnalysisConfig = Schema.Schema.Type<typeof AnalysisConfigSchema>
type AutoencoderConfig = Schema.Schema.Type<typeof AutoencoderConfigSchema>
type AnomalyResult = Schema.Schema.Type<typeof AnomalyResultSchema>
type AnomalyContext = Schema.Schema.Type<typeof AnomalyContextSchema>
type PatternResult = Schema.Schema.Type<typeof PatternResultSchema>

// AI Analysis Error ADT
type AnalysisError =
  | { _tag: 'ModelError'; message: string; modelType: string }
  | { _tag: 'TrainingError'; message: string; epoch?: number }
  | { _tag: 'InferenceError'; message: string; input: unknown }
  | { _tag: 'PatternError'; message: string; patternType: string }
  | { _tag: 'CorrelationError'; message: string; signals: string[] }
```

### Effect-TS Service Definitions

```typescript
// Service tags for dependency injection with unified processing
class AIAnalyzerService extends Context.Tag('AIAnalyzerService')<
  AIAnalyzerService,
  {
    // Real-time Analysis with streaming across both ingestion paths
    analyzeRealtimeStream: (
      dataStream: Stream.Stream<OTLPData, never, never>
    ) => Stream.Stream<AnomalyResult, AnalysisError, never>
    detectAnomalies: (timeWindow: TimeRange) => Effect.Effect<AnomalyResult[], AnalysisError, never>

    // NEW: Unified analysis methods
    analyzeUnifiedStream: () => Stream.Stream<AnomalyResult, AnalysisError, never>
    detectCrossPathAnomalies: (timeWindow: TimeRange) => Effect.Effect<AnomalyResult[], AnalysisError, never>
    compareIngestionPaths: (timeWindow: TimeRange) => Effect.Effect<IngestionAnalysis, AnalysisError, never>

    // Pattern Recognition
    detectPatterns: (timeWindow: TimeRange) => Effect.Effect<PatternResult[], AnalysisError, never>
    correlateAnomalies: (
      anomalies: AnomalyResult[]
    ) => Effect.Effect<CorrelationResult[], AnalysisError, never>

    // Model Management
    trainModels: (trainingData: TrainingDataset) => Effect.Effect<void, AnalysisError, never>
    updateModels: () => Effect.Effect<void, AnalysisError, never>
    getModelHealth: () => Effect.Effect<ModelHealthMetrics, AnalysisError, never>
  }
>() {}

// NEW: Unified Trace Processing Service
class UnifiedTraceService extends Context.Tag('UnifiedTraceService')<
  UnifiedTraceService,
  {
    // Query unified schema for AI processing
    queryUnifiedTraces: (query: TraceQuery) => Effect.Effect<NormalizedTrace[], AnalysisError, never>
    streamUnifiedTraces: (query: TraceQuery) => Stream.Stream<NormalizedTrace, AnalysisError, never>
    
    // Cross-path analysis capabilities
    detectSchemaInconsistencies: () => Effect.Effect<SchemaInconsistency[], AnalysisError, never>
    measureIngestionLatency: () => Effect.Effect<IngestionMetrics, AnalysisError, never>
    
    // Data quality assessment
    assessDataQuality: (timeWindow: TimeRange) => Effect.Effect<DataQualityReport, AnalysisError, never>
    recommendOptimalIngestionPath: (service: string) => Effect.Effect<IngestionRecommendation, AnalysisError, never>
  }
>() {}

class AutoencoderEngineService extends Context.Tag('AutoencoderEngineService')<
  AutoencoderEngineService,
  {
    train: (data: TrainingData) => Effect.Effect<void, AnalysisError, never>
    predict: (data: InputData) => Effect.Effect<AnomalyScore, AnalysisError, never>
    predictBatch: (data: InputData[]) => Effect.Effect<AnomalyScore[], AnalysisError, never>
    updateThreshold: (newData: ValidationData) => Effect.Effect<number, AnalysisError, never>

    // Model persistence with effect
    saveModel: (path: string) => Effect.Effect<void, AnalysisError, never>
    loadModel: (path: string) => Effect.Effect<void, AnalysisError, never>
  }
>() {}

// NEW: Unified real-time analysis across both ingestion paths
const makeUnifiedRealtimeAnalyzer = (config: AnalysisConfig) =>
  Effect.gen(function* (_) {
    const autoencoder = yield* _(AutoencoderEngineService)
    const storage = yield* _(ClickhouseStorageService)
    const unifiedTraceService = yield* _(UnifiedTraceService)

    return {
      // Legacy single-path analysis
      analyzeRealtimeStream: (dataStream: Stream.Stream<OTLPData, never, never>) =>
        dataStream.pipe(
          // Window data for batch processing
          Stream.groupedWithin(
            config.realtime.batchSize,
            Duration.seconds(config.realtime.windowSize)
          ),

          // Process each batch with concurrent analysis
          Stream.mapEffect(
            (batch) =>
              Effect.gen(function* (_) {
                // Parallel analysis for different data types
                const [traceAnomalies, metricAnomalies, logAnomalies] = yield* _(
                  Effect.all(
                    [
                      analyzeTraces(batch.filter((d) => d.traces)),
                      analyzeMetrics(batch.filter((d) => d.metrics)),
                      analyzeLogs(batch.filter((d) => d.logs))
                    ],
                    { concurrency: 'unbounded' }
                  )
                )

                return [...traceAnomalies, ...metricAnomalies, ...logAnomalies]
              }),
            { concurrency: 10 }
          ),

          // Flatten results
          Stream.flatMap(Stream.fromIterable),

          // Filter by threshold
          Stream.filter((anomaly) => anomaly.score > config.realtime.threshold),

          // Add correlation context
          Stream.mapEffect((anomaly) => enrichWithContext(anomaly))
        ),

      detectAnomalies: (timeWindow: TimeRange) =>
        Effect.gen(function* (_) {
          // Query data with streaming for large datasets
          const dataStream = yield* _(storage.queryForAIStream(timeWindow))

          // Process stream and collect results
          const anomalies = yield* _(
            dataStream.pipe(
              Stream.mapEffect((data) => autoencoder.predict(data)),
              Stream.filter((result) => result.score > config.realtime.threshold),
              Stream.run(Sink.collectAll()),
              Effect.map(Chunk.toReadonlyArray)
            )
          )

          return anomalies
        }),

      // NEW: Unified analysis across both ingestion paths
      analyzeUnifiedStream: () =>
        unifiedTraceService.streamUnifiedTraces({}).pipe(
          // Group by time windows for batch processing
          Stream.groupedWithin(
            config.realtime.batchSize,
            Duration.seconds(config.realtime.windowSize)
          ),

          // Process each batch with ML analysis
          Stream.mapEffect(
            (batch) =>
              Effect.gen(function* (_) {
                // Analyze each trace with autoencoder
                const anomalies = yield* _(
                  Effect.all(
                    batch.map((trace) =>
                      autoencoder.predict(trace).pipe(
                        Effect.map((score) => ({
                          ...score,
                          timestamp: Date.now(),
                          type: 'trace' as const,
                          ingestionPath: trace.ingestionPath,
                          schemaVersion: trace.schemaVersion,
                          crossPathCorrelation: config.unified.enableCrossPathAnalysis
                            ? yield* _(computeCrossPathCorrelation(trace))
                            : undefined
                        }))
                      )
                    ),
                    { concurrency: 'unbounded' }
                  )
                )

                return anomalies.filter(a => a.score > config.realtime.threshold)
              }),
            { concurrency: 10 }
          ),

          // Flatten and enrich results
          Stream.flatMap(Stream.fromIterable),
          Stream.mapEffect((anomaly) => enrichWithCrossPathContext(anomaly))
        ),

      detectCrossPathAnomalies: (timeWindow: TimeRange) =>
        Effect.gen(function* (_) {
          const [collectorAnomalies, directAnomalies] = yield* _(
            Effect.all([
              detectAnomalies(timeWindow, 'collector'),
              detectAnomalies(timeWindow, 'direct')
            ])
          )

          // Find anomalies that appear in one path but not the other
          const crossPathAnomalies = correlateAnomaliesByPath(
            collectorAnomalies,
            directAnomalies
          )

          return crossPathAnomalies
        }),

      compareIngestionPaths: (timeWindow: TimeRange) =>
        Effect.gen(function* (_) {
          const metrics = yield* _(
            unifiedTraceService.queryUnifiedTraces({
              timeRange: timeWindow,
              groupBy: ['ingestionPath']
            })
          )

          const comparison = {
            collector: analyzePathMetrics(metrics.filter(m => m.ingestionPath === 'collector')),
            direct: analyzePathMetrics(metrics.filter(m => m.ingestionPath === 'direct')),
            recommendations: generateIngestionRecommendations(metrics)
          }

          return comparison
        })
    }
  })

// Batch processing with scheduled execution
const makeBatchProcessor = (config: AnalysisConfig) =>
  Effect.gen(function* (_) {
    const autoencoder = yield* _(AutoencoderEngineService)
    const storage = yield* _(ClickhouseStorageService)

    return {
      scheduledTraining: Effect.schedule(
        Effect.gen(function* (_) {
          // Get training data from last period
          const trainingData = yield* _(getTrainingData(Duration.days(1)))

          // Train models with validation
          yield* _(
            autoencoder.train(trainingData).pipe(
              Effect.retry(
                Schedule.exponential('1 second').pipe(Schedule.compose(Schedule.recurs(3)))
              ),
              Effect.timeout('30 minutes'),
              Effect.catchAll((error) =>
                Effect.logError(`Training failed: ${error.message}`).pipe(
                  Effect.zipRight(Effect.fail(error))
                )
              )
            )
          )

          // Update thresholds based on validation data
          const validationData = yield* _(getValidationData())
          yield* _(autoencoder.updateThreshold(validationData))

          // Save updated models
          yield* _(autoencoder.saveModel(`models/${Date.now()}`))

          yield* _(Effect.logInfo('Batch training completed successfully'))
        }),
        Schedule.cron(config.batch.schedule)
      )
    }
  })

// Layers for dependency injection
const AIAnalyzerLayer = Layer.effect(AIAnalyzerService, makeRealtimeAnalyzer)

const AutoencoderEngineLayer = Layer.effect(
  AutoencoderEngineService,
  Effect.gen(function* (_) {
    const config = yield* _(Effect.service(ConfigService))
    return makeAutoencoder(config.ai.autoencoders)
  })
)
```

## Implementation Notes

<!-- COPILOT_SYNC: Analyze code in src/ai-analyzer and update this section -->

### Core Components

- **UnifiedTraceService**: Schema harmonization layer that queries `ai_traces_unified` materialized view
- **CrossPathAnalyzer**: NEW component for analyzing differences between collector and direct ingestion
- **AutoencoderEngine**: TensorFlow.js-based autoencoder implementation for each data type (enhanced for unified processing)
- **RealtimeProcessor**: Stream processing engine for immediate anomaly detection across both ingestion paths
- **BatchProcessor**: Daily batch analysis for pattern evolution and model updates (unified schema aware)
- **PatternDetector**: Advanced pattern recognition using statistical analysis and ML
- **CorrelationEngine**: Cross-signal correlation and root cause analysis (enhanced with ingestion path correlations)
- **IngestionPathOptimizer**: NEW component that recommends optimal ingestion paths per service

### Dependencies

- Internal dependencies: `storage` package for data access
- External dependencies:
  - `@effect/platform` - Effect-TS platform abstractions
  - `@effect/schema` - Schema validation and transformation
  - `@effect/stream` - Streaming data processing
  - `@tensorflow/tfjs-node` - Machine learning framework
  - `mathjs` - Statistical analysis utilities

## Code Generation Prompts

### Generate Base Implementation

Use this in Copilot Chat:

```
@workspace Based on the package overview in notes/packages/ai-analyzer/package.md, generate the initial implementation for:
- AIAnalyzer main class in src/ai-analyzer/analyzer.ts
- AutoencoderEngine in src/ai-analyzer/autoencoder.ts using TensorFlow.js
- RealtimeProcessor in src/ai-analyzer/realtime.ts with RxJS streams
- BatchProcessor in src/ai-analyzer/batch.ts with cron scheduling
- PatternDetector in src/ai-analyzer/patterns.ts with statistical analysis
- Comprehensive unit tests with mocked TensorFlow models
- Integration tests with sample telemetry data
```

### Update from Code

Use this in Copilot Chat:

```
@workspace Analyze the code in src/ai-analyzer and update notes/packages/ai-analyzer/package.md with:
- Current autoencoder architectures and performance metrics
- Real-time processing capabilities and latency characteristics
- Pattern detection algorithms and accuracy rates
- Model training procedures and update frequencies
- Recent improvements and optimizations
```

## AI Model Architecture

### Autoencoder Design

```typescript
// Trace Autoencoder Architecture
const traceAutoencoder = {
  inputLayer: 128, // Encoded span features
  hiddenLayers: [64, 32, 16, 32, 64],
  outputLayer: 128, // Reconstruction
  activation: 'relu',
  optimizer: 'adam',
  lossFunction: 'meanSquaredError'
}

// Metric Autoencoder Architecture
const metricAutoencoder = {
  inputLayer: 64, // Time-series features
  hiddenLayers: [32, 16, 8, 16, 32],
  outputLayer: 64, // Reconstruction
  activation: 'tanh',
  optimizer: 'adam',
  lossFunction: 'meanSquaredError'
}
```

### Feature Engineering

- **Trace Features**: Duration, error rate, call patterns, resource usage
- **Metric Features**: Value distributions, temporal patterns, seasonal trends
- **Log Features**: Event frequency, error patterns, severity distributions
- **Cross-Signal Features**: Correlation patterns between traces, metrics, and logs

## Training Strategy

### Initial Training

- **Cold Start**: Use OpenTelemetry demo application data for initial models
- **Baseline Models**: Pre-trained models for common patterns
- **Bootstrap Period**: 7 days minimum for stable anomaly detection

### Continuous Learning

- **Daily Retraining**: Update models with previous day's data
- **Drift Detection**: Monitor model performance and trigger retraining
- **A/B Testing**: Compare new models against current models before deployment
- **Feedback Loop**: Incorporate user feedback on anomaly accuracy

## Testing Strategy

<!-- Test coverage and testing approach -->

### Unit Tests

- Coverage target: 80%
- Key test scenarios:
  - Autoencoder training and prediction accuracy
  - Real-time anomaly detection with known patterns
  - Pattern recognition algorithm validation
  - Model persistence and loading
  - Correlation engine accuracy

### Integration Tests

- Test with synthetic telemetry data with known anomalies
- Performance benchmarks:
  - <50ms latency for real-time anomaly detection
  - > 95% accuracy after 30 days of training
  - Pattern detection within 24 hours of emergence

## Performance Characteristics

### Real-Time Processing

- **Latency Target**: <50ms for anomaly detection
- **Throughput**: Handle 1M+ data points per second
- **Memory Usage**: <2GB for real-time models
- **CPU Usage**: <20% on modern multi-core systems

### Batch Processing

- **Training Time**: <30 minutes for daily model updates
- **Data Volume**: Process 100GB+ of daily telemetry data
- **Model Size**: <100MB per autoencoder model
- **Storage**: Efficient model versioning and rollback

## Unified Processing Architecture

### Schema Harmonization

The AI analyzer leverages the `ai_traces_unified` materialized view in ClickHouse that combines:

- **OTLP Native Schema** (`otel_traces`): Standard OpenTelemetry format via Collector
- **Custom Schema** (`traces`): AI-optimized format via Direct OTLP ingestion

### Cross-Path Analysis Capabilities

**NEW AI-native features enabled by dual schema approach:**

1. **Ingestion Path Comparison**: Detect when collector vs direct paths behave differently
2. **Schema Drift Detection**: AI monitors for changes between schema versions  
3. **Cross-path Correlation**: Find patterns that span both ingestion methods
4. **Data Quality Scoring**: Compare trace completeness across paths
5. **Latency Analysis**: Measure processing delays by ingestion path
6. **Recommendation Engine**: Suggest optimal ingestion path per service

### AI Model Enhancements

**Unified processing enhances ML capabilities:**

- **Richer Feature Sets**: Combined data from both schemas provides more context
- **Path-aware Models**: Autoencoders can learn path-specific patterns
- **Cross-validation**: Models trained on one path can validate against the other
- **Ensemble Methods**: Combine predictions from path-specific models

### Performance Benefits

- **Parallel Processing**: Analyze both paths simultaneously
- **Early Detection**: Catch issues in one path before they affect the other
- **Load Balancing**: Distribute analysis workload across ingestion methods
- **Fault Tolerance**: Continue analysis if one ingestion path fails

## Change Log

<!-- Auto-updated by Copilot when code changes -->

### 2025-08-15

- **MAJOR**: Added unified processing architecture for dual schema analysis
- Added `ai_traces_unified` materialized view support
- Enhanced AI services with cross-path analysis capabilities
- Added ingestion path optimization and recommendation features
- Updated schemas to include ingestion path metadata and correlation

### 2025-08-13

- Initial package creation
- Defined autoencoder architecture for traces, metrics, logs
- Specified real-time and batch processing pipelines
- Added pattern detection and correlation capabilities
