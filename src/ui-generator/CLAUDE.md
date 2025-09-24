# UI Generator Package - Claude Context

## Package Overview
LLM-powered React component generation with Apache ECharts for dynamic observability dashboards.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Generated components must be valid TypeScript React
- Tests go in test/unit/ and test/integration/ subdirectories
- Always validate generated component syntax
- Use Apache ECharts for all data visualizations
- Components must handle loading and error states

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
export interface UIGenerator extends Context.Tag<"UIGenerator", {
  readonly generateComponent: (spec: ComponentSpec) => Effect.Effect<GeneratedComponent, UIError, never>
  readonly generateDashboard: (data: TelemetryData) => Effect.Effect<Dashboard, UIError, never>
  readonly validateComponent: (code: string) => Effect.Effect<ValidationResult, UIError, never>
}>{}
```

### Component Generation Pattern
```typescript
// Generate TypeScript React component from spec
const generateComponent = (spec: ComponentSpec) =>
  Effect.gen(function* () {
    const response = yield* llm.queryWithSchema(
      { prompt: buildComponentPrompt(spec) },
      ComponentResponseSchema
    )
    const validation = yield* validateTypeScript(response.code)
    if (!validation.valid) {
      return yield* Effect.fail({ _tag: "InvalidComponent", errors: validation.errors })
    }
    return { code: ensureImports(response.code), dependencies: response.dependencies }
  })
```

### ECharts Integration Pattern
```typescript
// Standard ECharts component structure
const ChartComponent: React.FC<Props> = ({ data, height = 400 }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption(option);
    return () => chart.dispose();
  }, [data]);
  return <div ref={chartRef} style={{ height }} />;
}
```

## Known Issues & Workarounds

### TypeScript Validation
- **Problem**: Generated code may have type errors
- **Workaround**: Always validate with TypeScript compiler
- **Fix**: Implement stricter LLM prompting

### ECharts Memory Leaks
- **Problem**: Charts not disposed properly
- **Workaround**: Always return cleanup function in useEffect
- **Fix**: Auto-generate disposal logic

## Common Pitfalls

❌ **DON'T**: Generate without TypeScript validation
❌ **DON'T**: Forget to dispose ECharts instances
❌ **DON'T**: Allow XSS vulnerabilities in generated code
❌ **DON'T**: Skip null/undefined data handling
❌ **DON'T**: Generate without error boundaries

✅ **DO**: Validate all generated TypeScript
✅ **DO**: Include cleanup in useEffect
✅ **DO**: Sanitize all user inputs
✅ **DO**: Handle edge cases gracefully
✅ **DO**: Wrap components in error boundaries

## Quick Command Reference

```bash
# Development
pnpm dev:ui-generator

# Testing
pnpm test ui-generator
pnpm test:integration ui-generator

# Generate component
pnpm generate:component

# Find active work
mcp__github__search_issues query:"package:ui-generator is:open"
```

## Dependencies & References
- `react` ^18.0.0
- `echarts` ^5.5.0
- `effect` ^3.11.0
- `@effect/schema` ^0.78.0
- LLM Manager (component generation)
- Storage (data queries)
- Full documentation: See README.md