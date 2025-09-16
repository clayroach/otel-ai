---
id: packages.ui-generator
title: UI Generator Package
desc: 'LLM-powered React component generation with Apache ECharts integration and ClickHouse query generation'
updated: 2025-09-12
created: 2025-08-13
---

# UI Generator Package

## Implementation Status

✅ **FULLY IMPLEMENTED** - Complete query generation and dynamic UI component generation working in production.

### ✅ Implemented
- **Query Generator Subsystem**: Natural language to ClickHouse SQL with multi-model support (src/ui-generator/)
- **React Component Generation**: Dynamic UI components with telemetry visualization (ui/src/)
- **Apache ECharts Integration**: Full chart library integration for data visualization
- **Dashboard Components**: Working dashboards with real-time data updates
- **API Client**: Effect-TS based client with proper error handling
- **Performance Optimization**: 200ms SQL generation with SQLCoder, 1.2-1.8s with GPT-4/Claude (PR #49)
- **Security**: SQL injection prevention with proper escaping
- **Test Infrastructure**: Comprehensive unit and integration tests

### 🚀 Future Enhancements
- Advanced role-based UI adaptation
- More sophisticated dashboard layouts
- Additional chart types and visualizations

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the ui-generator package -->

### Purpose

Generates dynamic React components and Apache ECharts visualizations using LLMs based on telemetry data patterns, user interactions, and role-based preferences. This is the key differentiator that replaces traditional dashboarding tools like Grafana with AI-native, personalized user interfaces.

**IMPLEMENTED**: The package includes a **query-generator subsystem** that provides LLM-powered ClickHouse SQL query generation for advanced telemetry analysis, with 10x performance improvements achieved in PR #49.

### Architecture

- **Query Generation Subsystem**: LLM-powered SQL generation for ClickHouse with multi-model support
- **LLM-Driven Component Generation**: Use GPT/Claude/Llama to generate React components from specifications
- **Component Templates**: Base templates for common visualization patterns
- **Real-Time Adaptation**: Components that adapt based on user interaction patterns
- **Role-Based UIs**: Tailored interfaces for DevOps, SRE, Developer roles
- **Apache ECharts Integration**: Advanced charting capabilities with full customization
- **Effect-TS Patterns**: Type-safe, composable operations throughout

## Core Features

### Query Generation Subsystem (NEW)

The query-generator subsystem provides intelligent SQL query generation for telemetry data analysis:

- **Multi-Model Support**: GPT-4, Claude 3, Local Llama, GPT-3.5 Turbo
- **Six Analysis Patterns**: Specialized patterns for different types of analysis
- **Lazy Evaluation**: QueryThunk pattern for expensive operations
- **Model Registry Integration**: Intelligent model selection based on requirements
- **Context-Aware Generation**: Incorporates user context and request parameters

#### Supported Analysis Patterns

1. **Latency Analysis** (`latency_analysis`)
   - P50, P95, P99 latency percentiles
   - Latency trends over time
   - Service-level latency breakdown

2. **Error Analysis** (`error_analysis`)
   - Error rates by service and operation
   - Error types and categories
   - Failed vs successful request ratios

3. **Bottleneck Analysis** (`bottleneck_analysis`)
   - Services with highest latency contribution
   - Operations taking the most time
   - Critical path bottlenecks

4. **Throughput Analysis** (`throughput_analysis`)
   - Requests per second by service
   - Throughput trends over time
   - Capacity utilization patterns

5. **Critical Path Analysis** (`critical_path_analysis`)
   - End-to-end trace analysis
   - Service call sequences and dependencies
   - Path latency breakdown

6. **Service Dependency Analysis** (`service_dependency_analysis`)
   - Service-to-service call patterns
   - Dependency graphs and relationships
   - Service coupling analysis

### Component Generation

- **Dynamic React Components**: LLM-generated components from telemetry data
- **Apache ECharts Integration**: Automatic chart type selection
- **Role-Based Dashboards**: Tailored views for different user roles
- **Real-Time Updates**: Components refresh with live data streams

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Query Generator Interfaces

```typescript
import { Effect, Context, Layer, Schema } from 'effect'

// Analysis patterns supported by the query generator
export const AnalysisPattern = Schema.Literal(
  'latency_analysis',
  'error_analysis',
  'bottleneck_analysis',
  'throughput_analysis',
  'critical_path_analysis',
  'service_dependency_analysis'
)

// Query generation request
export const QueryGenerationRequest = Schema.Struct({
  analysisType: AnalysisPattern,
  timeRange: Schema.Struct({
    startTime: Schema.String,
    endTime: Schema.String
  }),
  services: Schema.optional(Schema.Array(Schema.String)),
  operations: Schema.optional(Schema.Array(Schema.String)),
  filters: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  model: Schema.optional(Schema.String), // LLM model to use
  context: Schema.optional(Schema.String) // Additional context
})

// Generated query result
export const QueryGenerationResult = Schema.Struct({
  query: Schema.String,
  description: Schema.String,
  estimatedComplexity: Schema.Union(
    Schema.Literal('low'),
    Schema.Literal('medium'),
    Schema.Literal('high')
  ),
  expectedColumns: Schema.Array(Schema.String),
  modelUsed: Schema.String,
  generationTimeMs: Schema.Number
})

// Query Thunk for lazy evaluation
export interface QueryThunk {
  readonly execute: () => Effect.Effect<QueryGenerationResult, QueryGenerationError, never>
  readonly analysisType: AnalysisPattern
  readonly estimatedCost: 'low' | 'medium' | 'high'
}

// LLM Query Generator service
export interface LlmQueryGenerator extends Context.Tag<'LlmQueryGenerator', {
  readonly generateQuery: (
    request: QueryGenerationRequest
  ) => Effect.Effect<QueryGenerationResult, QueryGenerationError | InvalidRequestError, never>
  
  readonly generateQueryThunk: (
    request: QueryGenerationRequest  
  ) => Effect.Effect<QueryThunk, InvalidRequestError, never>
  
  readonly getSupportedPatterns: () => Effect.Effect<readonly AnalysisPattern[], never, never>
}> {}
```

### Component Generation Interfaces

```typescript
// Component generation request
const ComponentRequestSchema = Schema.Struct({
  type: Schema.Literal('dashboard', 'chart', 'table', 'card', 'alert'),
  data: Schema.Struct({
    source: Schema.String, // Query or data source identifier (can use generated queries)
    timeRange: Schema.optional(TimeRangeSchema),
    filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    aggregation: Schema.optional(Schema.String)
  }),
  user: Schema.Struct({
    id: Schema.String,
    role: Schema.Literal('devops', 'sre', 'developer', 'admin'),
    preferences: Schema.optional(UserPreferencesSchema),
    recentInteractions: Schema.optional(Schema.Array(InteractionSchema))
  }),
  style: Schema.optional(StylePreferencesSchema)
})

// UI Generator Service
interface UiGenerator extends Context.Tag<"UiGenerator", {
  readonly generateComponent: (
    request: ComponentRequestSchema
  ) => Effect.Effect<GeneratedComponent, GenerationError, never>
  
  readonly optimizeLayout: (
    components: GeneratedComponent[]
  ) => Effect.Effect<DashboardLayout, LayoutError, never>
  
  readonly streamUpdates: (
    componentId: string
  ) => Stream.Stream<ComponentUpdate, UpdateError, never>
}>{}
```

## Implementation Details

### Query Generation Process

1. **Request Validation**: Schema validation for QueryGenerationRequest
2. **Model Selection**: Choose optimal LLM based on complexity and requirements
3. **Prompt Building**: Combine analysis patterns, templates, and context
4. **Query Generation**: LLM generates ClickHouse SQL
5. **Result Processing**: Extract and validate generated SQL

### Query Templates

Base templates for each analysis pattern:

```typescript
const QUERY_TEMPLATES = {
  latency_analysis: `
    SELECT 
      service_name,
      quantile(0.5)(duration_ns / 1000000) as p50_ms,
      quantile(0.95)(duration_ns / 1000000) as p95_ms,
      quantile(0.99)(duration_ns / 1000000) as p99_ms
    FROM traces 
    WHERE start_time >= {START_TIME}
      AND start_time <= {END_TIME}
      {SERVICE_FILTER}
    GROUP BY service_name
    ORDER BY p95_ms DESC`,
  // ... other patterns
}
```

### Model Selection Strategy

```typescript
// Intelligent model selection based on requirements
export const selectQueryGenerationModel = (
  modelId?: string
): Effect.Effect<ModelConfig, NoSuitableModelError | ModelNotFoundError, ModelRegistry> =>
  Effect.gen(function* () {
    const registry = yield* ModelRegistry
    
    if (modelId) {
      return yield* registry.getModel(modelId)
    }
    
    return yield* registry.selectBestModel({
      requiredCapabilities: ['sql_generation', 'data_analysis'],
      maxLatency: 5000,
      minReliability: 0.8
    })
  })
```

### Component Generation Pipeline

```typescript
// Component generation flow with query integration
const generateVisualization = (spec: ComponentSpec) =>
  Effect.gen(function* () {
    // Generate query if needed
    const query = spec.useGeneratedQuery 
      ? yield* queryGenerator.generateQuery(spec.queryRequest)
      : spec.customQuery
    
    // Execute query
    const data = yield* storage.executeQuery(query.sql)
    
    // Generate component
    const component = yield* llm.generateComponent({
      template: selectTemplate(spec.type),
      data: data,
      chartConfig: getEChartsConfig(spec.type, data)
    })
    
    // Validate and optimize
    return yield* validateComponent(component)
  })
```

### Role-Based Dashboard Templates

```typescript
const DASHBOARD_TEMPLATES: Record<UserRole, DashboardConfig> = {
  devops: {
    priorityMetrics: ['system_health', 'alerts', 'capacity'],
    defaultQueries: ['throughput_analysis', 'error_analysis'],
    layout: 'operations_focused'
  },
  developer: {
    priorityMetrics: ['latency_trends', 'error_rates', 'dependencies'],
    defaultQueries: ['latency_analysis', 'critical_path_analysis'],
    layout: 'development_focused'
  },
  sre: {
    priorityMetrics: ['sla_compliance', 'incidents', 'reliability'],
    defaultQueries: ['error_analysis', 'bottleneck_analysis'],
    layout: 'reliability_focused'
  }
}
```

## Testing Strategy

### Test Structure

```
src/ui-generator/
├── test/                              # ALL tests in subdirectory
│   ├── unit/                         # Unit tests
│   │   └── llm-query-generator.test.ts
│   ├── integration/                  # Integration tests
│   │   └── multi-model-query-generation.test.ts
│   └── fixtures/                     # Test data and schemas
└── query-generator/                  # Implementation
```

### Query Generator Tests

#### Unit Tests
- Request validation and schema compliance
- Query template selection
- Result parsing and validation
- QueryThunk lazy evaluation
- Error handling

#### Integration Tests
- Multi-model consistency (GPT-4, Claude 3, Local Llama)
- Performance benchmarking
- Context-aware generation
- Model fallback scenarios

### Component Generation Tests
- Component generation with various specifications
- Layout optimization algorithms
- Real-time update streaming
- Role-based customization

## Performance Optimization

### Query Generation
- **Target**: < 5 seconds per query
- **Model Selection**: Based on complexity and latency requirements
- **Lazy Evaluation**: QueryThunks defer expensive operations
- **Template Caching**: Reuse common patterns

### Component Rendering
- **Virtual Scrolling**: For large datasets
- **Memoization**: Prevent unnecessary re-renders
- **Canvas Rendering**: For complex visualizations
- **Progressive Loading**: Prioritize visible content

## Configuration

### Environment Variables

```bash
# LLM Configuration
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
DEFAULT_MODEL=gpt-4

# ClickHouse Connection
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=otel

# UI Generation Settings
COMPONENT_CACHE_TTL=3600
MAX_GENERATION_TIME=30000
ENABLE_VISUAL_TESTS=true
```

### Model Configuration

```typescript
const MODEL_CONFIG = {
  query_generation: {
    primary: 'gpt-4',
    fallback: ['claude-3', 'gpt-3.5-turbo'],
    timeout: 5000,
    requiredCapabilities: ['sql_generation', 'data_analysis']
  },
  component_generation: {
    primary: 'gpt-4',
    fallback: ['claude-3'],
    timeout: 30000,
    requiredCapabilities: ['code_generation', 'react']
  }
}
```

## Error Handling

### Query Generation Errors

```typescript
export class QueryGenerationError extends Schema.TaggedError<QueryGenerationError>()('QueryGenerationError', {
  message: Schema.String,
  analysisType: Schema.optional(AnalysisPattern),
  modelUsed: Schema.optional(Schema.String)
})

export class InvalidRequestError extends Schema.TaggedError<InvalidRequestError>()('InvalidRequestError', {
  message: Schema.String,
  invalidFields: Schema.Array(Schema.String)
})
```

### Component Generation Errors

```typescript
export class GenerationError extends Schema.TaggedError<GenerationError>()('GenerationError', {
  message: Schema.String,
  componentType: Schema.String,
  phase: Schema.Literal('generation', 'validation', 'compilation')
})
```

## Usage Examples

### Query Generation

```typescript
import { LlmQueryGenerator } from './query-generator'

// Generate a latency analysis query
const generator = yield* LlmQueryGenerator
const result = yield* generator.generateQuery({
  analysisType: 'latency_analysis',
  timeRange: {
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-01-01T01:00:00Z'
  },
  services: ['user-service', 'order-service'],
  model: 'gpt-4',
  context: 'Peak traffic analysis'
})

console.log(result.query) // Generated ClickHouse SQL
console.log(result.estimatedComplexity) // 'low' | 'medium' | 'high'
```

### Lazy Query Generation

```typescript
// Create a query thunk for deferred execution
const thunk = yield* generator.generateQueryThunk({
  analysisType: 'critical_path_analysis',
  timeRange: { /* ... */ },
  services: ['frontend', 'api-gateway', 'backend']
})

// Execute when needed
const result = yield* thunk.execute()
```

### Component Generation with Generated Query

```typescript
// Generate component with LLM-generated query
const component = yield* uiGenerator.generateComponent({
  type: 'chart',
  data: {
    source: 'generated',
    queryRequest: {
      analysisType: 'error_analysis',
      timeRange: { /* ... */ },
      services: ['payment-service']
    }
  },
  user: {
    id: 'user123',
    role: 'developer'
  }
})
```

## Dependencies

### Internal Dependencies
- **storage**: ClickHouse integration for query execution
- **llm-manager**: Multi-model LLM orchestration and model registry
- **config-manager**: Dynamic configuration management

### External Libraries
- **Effect-TS**: Functional programming patterns
- **@effect/schema**: Runtime type validation
- **Apache ECharts**: Advanced charting library
- **React**: Component framework

## Future Enhancements

### Query Generation
- **Query Optimization**: Analyze and optimize generated SQL
- **Incremental Learning**: Improve generation based on feedback
- **Custom Patterns**: User-defined analysis patterns
- **Query Explanation**: Natural language explanations

### Component Generation
- **A/B Testing**: Generate multiple component variants
- **Predictive Layouts**: Anticipate user needs
- **Natural Language UI**: Generate from text descriptions
- **Collaborative Editing**: Multi-user dashboard creation

### Performance
- **Edge Generation**: Generate closer to users
- **WebAssembly**: High-performance rendering
- **Streaming Generation**: Progressive component updates
- **Intelligent Caching**: ML-powered cache strategies

## Related Documentation

- [Test Containerization Plan](./test-containerization.md) - Testing strategy with Ollama containers
- [Model Registry](../llm-manager/package.md) - Multi-model LLM management
- [Storage Package](../storage/package.md) - ClickHouse integration