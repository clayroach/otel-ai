# UI Generator Package

LLM-powered React component generation with Apache ECharts integration for dynamic dashboard creation.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test:ui-generator
```

## Key Features

- **LLM-Generated Components**: AI creates React components from data and requirements
- **Apache ECharts Integration**: Rich chart library with 20+ chart types
- **Dynamic Dashboards**: Runtime component generation based on data patterns
- **Type-Safe Generation**: Generated components include full TypeScript definitions
- **Effect-TS Integration**: Streaming component generation with structured error handling

## Installation

```bash
pnpm install
```

## Basic Usage

```typescript
import { UIGenerator } from '@otel-ai/ui-generator'

// Initialize generator
const generator = UIGenerator.make({
  llmProvider: 'openai',
  chartLibrary: 'echarts'
})

// Generate component from data
const component = await generator.generateComponent({
  data: telemetryData,
  type: 'line-chart',
  requirements: 'Show response time trends by service'
})

// Generate dashboard
const dashboard = await generator.generateDashboard({
  services: ['api', 'db', 'cache'],
  metrics: ['latency', 'throughput', 'errors']
})
```

## API Overview

- `generateComponent()` - Create React component from data and requirements
- `generateDashboard()` - Create complete dashboard layouts
- `generateChart()` - Create ECharts configurations
- `validateComponent()` - Type-check and validate generated components

## Documentation

For comprehensive documentation, component templates, and generation patterns, see:

📖 **[UI Generator Package Documentation](../../notes/packages/ui-generator/package.md)**

## Supported Chart Types

- Line charts, bar charts, scatter plots
- Heatmaps, treemaps, parallel coordinates
- Real-time streaming charts
- Custom interactive visualizations

## Testing

```bash
# Unit tests
pnpm test:unit

# Integration tests (requires LLM access)
pnpm test:integration
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for development workflow and UI generation patterns.