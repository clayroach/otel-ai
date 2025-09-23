# UI Generator Package - Claude Context

## Package Overview
LLM-powered React component generation with Apache ECharts for dynamic observability dashboards. Generates TypeScript components from natural language descriptions and telemetry data.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Generated components must be valid TypeScript React
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Always validate generated component syntax
- Use Apache ECharts for all data visualizations
- Components must handle loading and error states

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// UI Generator service definition
export interface UIGenerator extends Context.Tag<"UIGenerator", {
  readonly generateComponent: (spec: ComponentSpec) => Effect.Effect<GeneratedComponent, UIError, never>
  readonly generateDashboard: (data: TelemetryData) => Effect.Effect<Dashboard, UIError, never>
  readonly validateComponent: (code: string) => Effect.Effect<ValidationResult, UIError, never>
  readonly optimizeForRole: (component: string, role: UserRole) => Effect.Effect<string, UIError, never>
}>{}

export const UIGeneratorLive = Layer.effect(
  UIGenerator,
  Effect.gen(function* () {
    const llm = yield* LLMManager
    const validator = yield* ComponentValidator

    return UIGenerator.of({
      generateComponent: (spec) => Effect.gen(function* () {
        // Generate with validation
      })
    })
  })
)
```

### Component Generation Pattern
```typescript
// Generate TypeScript React component from spec
export const generateComponent = (spec: ComponentSpec) =>
  Effect.gen(function* () {
    const prompt = buildComponentPrompt(spec)

    // Query LLM with component schema
    const response = yield* llm.queryWithSchema(
      {
        prompt,
        systemPrompt: REACT_COMPONENT_SYSTEM_PROMPT,
        temperature: 0.7
      },
      ComponentResponseSchema
    )

    // Validate TypeScript syntax
    const validation = yield* validateTypeScript(response.code)
    if (!validation.valid) {
      return yield* Effect.fail({ _tag: "InvalidComponent", errors: validation.errors })
    }

    // Ensure ECharts imports are correct
    const finalCode = ensureImports(response.code)

    return {
      code: finalCode,
      dependencies: response.dependencies,
      props: response.props
    }
  })
```

### ECharts Integration Pattern
```typescript
// Standard ECharts component wrapper
const ECHARTS_TEMPLATE = `
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { EChartsOption } from 'echarts';

interface Props {
  data: any;
  title?: string;
  height?: number;
}

export const ChartComponent: React.FC<Props> = ({ data, title, height = 400 }) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const option: EChartsOption = {
      // Generated chart configuration
    };

    chart.setOption(option);
    return () => chart.dispose();
  }, [data]);

  return <div ref={chartRef} style={{ height }} />;
};
`
```

### Error Handling Pattern
```typescript
export type UIError =
  | { _tag: "InvalidComponent"; errors: ReadonlyArray<string> }
  | { _tag: "GenerationFailed"; message: string }
  | { _tag: "ValidationFailed"; code: string; errors: ReadonlyArray<string> }
  | { _tag: "DependencyError"; missing: ReadonlyArray<string> }
  | { _tag: "RoleOptimizationError"; role: string; message: string }
```

## API Contracts

### UI Generator Service Interface
```typescript
import { Context, Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'

// Main UI generator service
export interface UIGenerator extends Context.Tag<"UIGenerator", {
  // Component generation
  readonly generateComponent: (
    spec: ComponentSpec
  ) => Effect.Effect<GeneratedComponent, UIError, never>

  // Dashboard generation
  readonly generateDashboard: (
    data: TelemetryData,
    preferences: DashboardPreferences
  ) => Effect.Effect<Dashboard, UIError, never>

  // Validation
  readonly validateComponent: (
    code: string
  ) => Effect.Effect<ValidationResult, UIError, never>

  // Role-based optimization
  readonly optimizeForRole: (
    component: string,
    role: UserRole
  ) => Effect.Effect<string, UIError, never>

  // Chart generation
  readonly generateChart: (
    data: ChartData,
    type: ChartType
  ) => Effect.Effect<EChartsOption, UIError, never>
}>{}

// Schemas
export const ComponentSpecSchema = Schema.Struct({
  type: Schema.Literal("chart", "table", "metric", "alert", "custom"),
  data: Schema.Unknown,
  description: Schema.String,
  styling: Schema.optional(Schema.Struct({
    theme: Schema.Literal("light", "dark"),
    colors: Schema.optional(Schema.Array(Schema.String)),
    responsive: Schema.Boolean
  }))
})

export const GeneratedComponentSchema = Schema.Struct({
  code: Schema.String,
  dependencies: Schema.Array(Schema.String),
  props: Schema.Record(Schema.String, Schema.Unknown),
  preview: Schema.optional(Schema.String)
})

export const DashboardSchema = Schema.Struct({
  layout: Schema.Array(Schema.Struct({
    id: Schema.String,
    component: Schema.String,
    position: Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
      w: Schema.Number,
      h: Schema.Number
    })
  })),
  theme: Schema.String,
  refreshInterval: Schema.Number
})

export const ChartType = Schema.Literal(
  "line", "bar", "scatter", "pie", "heatmap",
  "sankey", "treemap", "gauge", "funnel"
)
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Generating components without TypeScript validation
- ❌ Missing React import statements
- ❌ Invalid JSX syntax in generated code
- ❌ Not handling undefined/null data in components
- ❌ Forgetting to dispose ECharts instances
- ❌ Generating components with XSS vulnerabilities
- ❌ Not memoizing expensive computations
- ❌ Missing error boundaries in generated components

## Testing Requirements
- Unit tests: Mock LLM responses, validate component generation
- Integration tests: Generate and compile real components
- Syntax tests: TypeScript compilation validation
- Security tests: XSS and injection prevention
- Performance tests: Component render time
- Test commands: `pnpm test:unit:ui-generator`, `pnpm test:integration:ui-generator`

## Performance Considerations

### Optimization Strategies
- Cache generated components by hash of spec
- Use React.memo for generated components
- Implement virtual scrolling for large data tables
- Lazy load ECharts modules
- Use Web Workers for data processing

### ECharts Optimization
```typescript
// Optimize chart rendering
const chartConfig = {
  animation: false,  // Disable for large datasets
  progressive: 1000,  // Progressive rendering threshold
  progressiveThreshold: 10000,  // Switch to progressive
  hoverLayerThreshold: 10000,  // Hover optimization
  useUTC: true  // Consistent timezone handling
}
```

### Component Template Library
```typescript
// Pre-built optimized templates
const templates = {
  MetricCard: METRIC_CARD_TEMPLATE,
  TimeSeriesChart: TIME_SERIES_TEMPLATE,
  ServiceMap: SERVICE_MAP_TEMPLATE,
  ErrorTable: ERROR_TABLE_TEMPLATE,
  LatencyHistogram: LATENCY_HISTOGRAM_TEMPLATE
}
```

## Dependencies & References
- External:
  - `react` ^18.0.0
  - `echarts` ^5.5.0
  - `echarts-for-react` ^3.0.2
  - `typescript` ^5.5.0
  - `effect` ^3.11.0
  - `@effect/schema` ^0.78.0
- Internal:
  - LLM Manager (for component generation)
  - Storage (for data queries)
- Documentation:
  - Apache ECharts: https://echarts.apache.org/
  - React TypeScript: https://react-typescript-cheatsheet.netlify.app/

## Quick Start Commands
```bash
# Development
pnpm dev:ui-generator

# Testing
pnpm test:unit:ui-generator
pnpm test:integration:ui-generator

# Generate component
pnpm generate:component

# Building
pnpm build:ui-generator

# Find active work
mcp__github__search_issues query:"package:ui-generator is:open"
```