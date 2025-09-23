# Server Package - Claude Context

## Package Overview
Backend API server handling OTLP ingestion, REST/GraphQL endpoints, WebSocket streaming, and service orchestration. Central coordinator for all platform services.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Schema validation required for all API inputs/outputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Use Express with Effect-TS HTTP middleware
- OTLP endpoint at /v1/traces (OpenTelemetry standard)
- GraphQL endpoint at /graphql
- WebSocket at /ws for real-time updates

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// Server service definition
export interface Server extends Context.Tag<"Server", {
  readonly start: () => Effect.Effect<void, ServerError, never>
  readonly stop: () => Effect.Effect<void, never, never>
  readonly health: () => Effect.Effect<HealthStatus, never, never>
}>{}

export const ServerLive = Layer.effect(
  Server,
  Effect.gen(function* () {
    const storage = yield* Storage
    const aiAnalyzer = yield* AIAnalyzer
    const llmManager = yield* LLMManager
    const uiGenerator = yield* UIGenerator

    const app = express()
    setupMiddleware(app)
    setupRoutes(app, { storage, aiAnalyzer, llmManager, uiGenerator })

    return Server.of({
      start: () => Effect.gen(function* () {
        yield* Effect.promise(() => app.listen(PORT))
      })
    })
  })
)
```

### OTLP Ingestion Pattern
```typescript
// OTLP endpoint handler with Effect-TS
const handleOTLP = (storage: Storage) =>
  (req: Request, res: Response) => {
    const program = Effect.gen(function* () {
      // Validate OTLP format
      const data = yield* Schema.decodeUnknown(OTLPExportTraceServiceRequest)(req.body)

      // Convert to internal format
      const traces = yield* convertOTLPToTraces(data)

      // Store with retry logic
      yield* storage.writeTraces(traces).pipe(
        Effect.retry(Schedule.exponential(100))
      )

      return { success: true }
    })

    Effect.runPromise(program)
      .then(result => res.json(result))
      .catch(error => res.status(500).json({ error: error.message }))
  }
```

### GraphQL Schema Pattern
```typescript
// Type-safe GraphQL with Effect-TS
const typeDefs = `
  type Query {
    traces(timeRange: TimeRangeInput!): [Trace!]!
    topology(timeRange: TimeRangeInput!): ServiceTopology!
    anomalies(service: String): [Anomaly!]!
  }

  type Mutation {
    analyzeTraces(traceIds: [ID!]!): AnalysisResult!
  }

  type Subscription {
    anomalyDetected(service: String): Anomaly!
  }
`

const resolvers = {
  Query: {
    traces: (_, { timeRange }) =>
      Effect.runPromise(storage.queryTraces(timeRange)),
    topology: (_, { timeRange }) =>
      Effect.runPromise(storage.getServiceTopology(timeRange))
  }
}
```

### WebSocket Pattern
```typescript
// Real-time updates with Effect-TS streams
const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    const stream = aiAnalyzer.streamAnalysis(traceStream)
      .pipe(
        Stream.tap(anomaly =>
          Effect.sync(() => ws.send(JSON.stringify(anomaly)))
        )
      )

    Effect.runPromise(Stream.runDrain(stream))
  })
}
```

### Error Handling Pattern
```typescript
export type ServerError =
  | { _tag: "StartupError"; port: number; cause: unknown }
  | { _tag: "OTLPValidationError"; message: string }
  | { _tag: "RouteError"; path: string; method: string; cause: unknown }
  | { _tag: "WebSocketError"; message: string }
  | { _tag: "ServiceUnavailable"; service: string }
```

## API Contracts

### Server Service Interface
```typescript
import { Context, Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'

// Main server service
export interface Server extends Context.Tag<"Server", {
  // Lifecycle
  readonly start: () => Effect.Effect<void, ServerError, never>
  readonly stop: () => Effect.Effect<void, never, never>
  readonly restart: () => Effect.Effect<void, ServerError, never>

  // Health & metrics
  readonly health: () => Effect.Effect<HealthStatus, never, never>
  readonly metrics: () => Effect.Effect<ServerMetrics, never, never>
}>{}

// API route handlers
export interface APIHandlers {
  // OTLP ingestion
  readonly handleOTLP: (
    data: OTLPExportTraceServiceRequest
  ) => Effect.Effect<void, ServerError, Storage>

  // REST endpoints
  readonly queryTraces: (
    params: QueryParams
  ) => Effect.Effect<ReadonlyArray<Trace>, ServerError, Storage>

  readonly getTopology: (
    timeRange: TimeRange
  ) => Effect.Effect<ServiceTopology, ServerError, Storage>

  // Analysis endpoints
  readonly detectAnomalies: (
    traceIds: ReadonlyArray<string>
  ) => Effect.Effect<AnomalyReport, ServerError, AIAnalyzer>

  // UI generation
  readonly generateDashboard: (
    spec: DashboardSpec
  ) => Effect.Effect<Dashboard, ServerError, UIGenerator>
}

// Request/Response schemas
export const OTLPRequestSchema = Schema.Struct({
  resourceSpans: Schema.Array(ResourceSpanSchema)
})

export const QueryParamsSchema = Schema.Struct({
  service: Schema.optional(Schema.String),
  operation: Schema.optional(Schema.String),
  timeRange: TimeRangeSchema,
  limit: Schema.optional(Schema.Number)
})

export const HealthStatusSchema = Schema.Struct({
  status: Schema.Literal("healthy", "degraded", "unhealthy"),
  services: Schema.Record(
    Schema.String,
    Schema.Struct({
      status: Schema.Literal("up", "down"),
      latency: Schema.optional(Schema.Number)
    })
  ),
  timestamp: Schema.Number
})
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Not validating OTLP data before storage
- ❌ Missing rate limiting on endpoints
- ❌ Blocking operations in request handlers
- ❌ Not implementing circuit breakers for services
- ❌ Missing CORS configuration
- ❌ Not handling WebSocket reconnections
- ❌ Unbounded GraphQL queries (missing depth limiting)
- ❌ Not implementing graceful shutdown

## Testing Requirements
- Unit tests: Mock service dependencies
- Integration tests: Full server with Docker services
- Load tests: Handle 10K requests/second
- OTLP tests: Various telemetry formats
- WebSocket tests: Connection handling and streaming
- Test commands: `pnpm test:unit:server`, `pnpm test:integration:server`

## Performance Considerations

### Optimization Strategies
- Request batching for OTLP ingestion
- Connection pooling for database
- Response caching with Redis
- GraphQL query complexity analysis
- Rate limiting per client
- Circuit breakers for downstream services

### Middleware Configuration
```typescript
// Essential middleware setup
app.use(compression())  // Response compression
app.use(helmet())  // Security headers
app.use(cors(corsOptions))  // CORS configuration
app.use(express.json({ limit: '10mb' }))  // JSON body parser
app.use(rateLimiter)  // Rate limiting
app.use(requestLogger)  // Request logging
```

### OTLP Batch Processing
```typescript
// Batch OTLP writes for efficiency
const batchProcessor = BatchProcessor.make({
  batchSize: 1000,
  maxWaitTime: Duration.seconds(5),
  process: (batch) => storage.writeBatch(batch)
})
```

## Dependencies & References
- External:
  - `express` ^4.19.0
  - `apollo-server-express` ^3.13.0
  - `ws` ^8.16.0 (WebSocket)
  - `compression` ^1.7.4
  - `helmet` ^7.1.0
  - `effect` ^3.11.0
  - `@effect/schema` ^0.78.0
- Internal:
  - Storage (data persistence)
  - AI Analyzer (anomaly detection)
  - LLM Manager (AI features)
  - UI Generator (dashboard creation)
- Documentation:
  - OTLP Spec: https://opentelemetry.io/docs/specs/otlp/
  - GraphQL Best Practices: https://graphql.org/learn/best-practices/

## Quick Start Commands
```bash
# Development
pnpm dev:server

# Testing
pnpm test:unit:server
pnpm test:integration:server

# Load testing
pnpm test:load:server

# Building
pnpm build:server

# Find active work
mcp__github__search_issues query:"package:server is:open"
```