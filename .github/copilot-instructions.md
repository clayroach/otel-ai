# Copilot Instructions for OpenTelemetry Project

## Project Context

This is an OpenTelemetry implementation project with integrated Dendron documentation.
Each package has a corresponding note in `notes/packages/` that documents its design and implementation.

## Important: Documentation-Driven Development

1. Package specifications are written FIRST in `notes/packages/[package]/package.md`
2. Code is generated FROM these specifications
3. Documentation is updated when code changes

## Package Documentation Rules

### When asked to "document package"

Analyze the code and update the corresponding note in notes/packages/ with:

1. Current implementation summary with code examples
2. Public API documentation with TypeScript signatures
3. Dependencies and interactions
4. OpenTelemetry instrumentation details:
   - Span names and attributes
   - Metrics and their types
   - Context propagation approach
5. Recent changes with dates

### When asked to "generate from note"

Read the package.md file and:

1. Create code matching the specifications exactly
2. Follow the architectural decisions described
3. Include appropriate OpenTelemetry patterns:
   - Proper span creation with semantic conventions
   - Context propagation using W3C Trace Context
   - Metric instrumentation with proper types
   - Error handling with span status codes
4. Add JSDoc comments referencing the note
5. Include comprehensive unit tests

## OpenTelemetry Patterns

### Tracer Implementation

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('package-name', '1.0.0')

function instrumentedFunction() {
  return tracer.startActiveSpan('operation.name', (span) => {
    try {
      span.setAttributes({
        'service.name': 'my-service',
        'operation.type': 'process'
      })
      // ... operation logic
      return result
    } catch (error) {
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}
```

### Metrics

```typescript
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('package-name', '1.0.0')
const counter = meter.createCounter('operations.count')
const histogram = meter.createHistogram('operation.duration')

counter.add(1, { 'operation.type': 'process' })
histogram.record(durationMs, { 'operation.status': 'success' })
```

### Context Propagation

```typescript
import { propagation, context } from '@opentelemetry/api'

// Inject context
const headers = {}
propagation.inject(context.active(), headers)

// Extract context
const extractedContext = propagation.extract(context.active(), headers)
```

## Code Quality Standards

- TypeScript with strict mode enabled
- 80% minimum test coverage
- JSDoc comments for all public APIs
- Follow OpenTelemetry semantic conventions
- Use consistent error handling patterns

## Bidirectional Sync

- Keep notes/packages/_/package.md in sync with src/_
- Each significant code change should update documentation
- Each specification change should regenerate affected code
- Use git commits to track sync points

## Daily Workflow Support

When working with daily notes:

1. Check for incomplete tasks from previous days
2. Link package work to daily goals
3. Document OpenTelemetry decisions
4. Save successful prompts for reuse

## Example Prompts

### For Code Generation:

```
@workspace Read notes/packages/tracer/package.md and generate a complete tracer implementation with:
- OpenTelemetry SDK integration
- W3C Trace Context propagation
- Sampling configuration
- Span processors (batch and simple)
- Comprehensive unit tests
Place the code in src/tracer/
```

### For Documentation:

```
@workspace Analyze src/metrics/ and update notes/packages/metrics/package.md with:
- Current metric instruments (counters, histograms, gauges)
- Aggregation temporality settings
- Export configuration
- Performance considerations
- Example usage code
```

### For Daily Review:

```
@workspace Review git changes from today and:
1. List all modified packages
2. Identify undocumented changes
3. Suggest updates for notes/daily/2024.01.20.md
4. Highlight any OpenTelemetry best practices violations
```

### For Architecture Decisions:

```
@workspace Create an ADR in notes/design/adr/ for the decision to use:
- OTLP over HTTP instead of gRPC
- Include performance implications
- Security considerations
- Implementation complexity
Follow the ADR template format
```

## Testing Guidelines

When generating tests:

1. Test OpenTelemetry instrumentation explicitly
2. Verify span attributes and names
3. Check context propagation
4. Validate metric values
5. Test error scenarios with proper span status

## Remember

- Always reference the package note when generating code
- Keep documentation and code in perfect sync
- Follow OpenTelemetry semantic conventions
- Document all design decisions in ADRs
