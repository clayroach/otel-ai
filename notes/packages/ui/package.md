---
id: packages.ui
title: UI Package
desc: 'Standalone Electron + React observability interface with Monaco SQL editor and dual ingestion visualization'
updated: 2025-08-15
created: 2025-08-15
---

# UI Package

## Package Overview

### Purpose

Standalone desktop and web application providing a professional SQL interface for querying and visualizing traces from both OpenTelemetry Collector and direct OTLP ingestion paths. Built with Electron, React, Monaco Editor, and resizable panels for optimal user experience.

### Architecture

- **Electron + React**: Desktop application with web deployment capability
- **Monaco SQL Editor**: VS Code-quality SQL editing with ClickHouse syntax highlighting
- **Resizable Panels**: Draggable splitter between query editor and results
- **Dual Ingestion Visualization**: Unified view of collector and direct OTLP traces
- **Query History**: Smart query management with descriptive timestamps
- **TypeScript 2022 + pnpm**: Modern development stack

## Current Implementation

### Core Features

#### 1. Monaco SQL Editor
- **Full SQL Support**: ClickHouse-specific syntax highlighting and auto-completion  
- **Keyboard Shortcuts**: Cmd+Enter to execute queries, standard editor shortcuts
- **Error Detection**: Real-time syntax validation with error highlighting
- **Function Correction**: Auto-fixes common issues like `subtracthours` → `subtractHours`

#### 2. Query Management
- **History System**: Last 10 queries with smart descriptions and timestamps
- **Query Descriptions**: AI-generated summaries like "ai_traces_unified: 3h timespan (100 rows)"
- **Format & Fix**: SQL beautification with automatic error correction
- **Copy/Clear/Save**: Standard editor operations with tooltips

#### 3. Resizable Interface
- **Draggable Splitter**: Professional panel resizing like VS Code
- **Default Layout**: 30% editor, 70% results for optimal viewing
- **Size Constraints**: Min 20% editor, Max 60% editor, Min 40% results
- **Responsive Design**: Adapts to different screen sizes

#### 4. Dual Ingestion Visualization
- **Unified Results**: Shows traces from both collector and direct paths
- **Ingestion Path Indicator**: Clear labeling of data source (collector/direct)
- **Schema Harmonization**: Consistent display despite different source schemas
- **Error Highlighting**: Visual distinction for error traces

### Technical Stack

```typescript
// Core Dependencies
{
  "react": "^18.2.0",
  "electron": "^25.3.1", 
  "monaco-editor": "^0.41.0",
  "@monaco-editor/react": "^4.5.1",
  "react-resizable-panels": "^3.0.4",
  "antd": "^5.8.4",
  "zustand": "^4.4.1",
  "react-query": "^3.39.3",
  "sql-formatter": "^15.6.6",
  "axios": "^1.5.0"
}
```

### File Structure

```
ui/
├── src/
│   ├── components/
│   │   ├── Layout/Layout.tsx              # Main application layout
│   │   ├── MonacoEditor/
│   │   │   └── MonacoQueryEditor.tsx      # SQL editor with ClickHouse support
│   │   ├── TraceResults/TraceResults.tsx  # Query results display
│   │   └── TimeRangeSelector/             # Time range filtering
│   ├── hooks/
│   │   ├── useClickhouseQuery.ts          # React Query + ClickHouse integration
│   │   └── useMenuActions.ts              # Electron menu handling
│   ├── store/
│   │   └── appStore.ts                    # Zustand state management
│   ├── views/
│   │   └── TracesView/TracesView.tsx      # Main traces interface
│   └── main.tsx                           # Application entry point
├── electron/                              # Electron main process
├── package.json                           # pnpm + TypeScript 2022 config
├── vite.config.ts                         # Vite dev server with ClickHouse proxy
└── tsconfig.json                          # TypeScript configuration
```

## API Integration

### ClickHouse Connectivity

```typescript
// Vite development proxy configuration
export default defineConfig({
  server: {
    proxy: {
      '/api/clickhouse': {
        target: 'http://localhost:8123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/clickhouse/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const auth = Buffer.from('otel:otel123').toString('base64');
            proxyReq.setHeader('Authorization', `Basic ${auth}`);
          });
        },
      },
    },
  },
});
```

### Query Interface

```typescript
// React Query hook for ClickHouse
export const useClickhouseQuery = (
  query: string,
  options?: QueryOptions
) => {
  const { clickhouseUrl, clickhouseAuth } = useAppStore();

  return useQuery({
    queryKey: ['clickhouse-query', query, clickhouseUrl],
    queryFn: () => executeClickhouseQuery(query, clickhouseUrl, clickhouseAuth),
    enabled: Boolean(query.trim()),
    retry: (failureCount, error) => {
      if (error.message.includes('Syntax error') || 
          error.message.includes('Authentication failed')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
```

## State Management

### Zustand Store Structure

```typescript
interface AppState {
  // Theme and layout
  darkMode: boolean;
  sidebarCollapsed: boolean;
  
  // Query management
  activeQuery: string;
  queryHistory: Array<{
    query: string;
    timestamp: string;
    description: string;
  }>;
  
  // Connection settings
  clickhouseUrl: string;
  clickhouseAuth: {
    username: string;
    password: string;
  };
  
  // Time range filtering
  timeRange: {
    start: string;
    end: string;
  };
}
```

### Query History Intelligence

```typescript
// Smart query description extraction
const extractQueryDescription = (query: string): string => {
  // Analyzes SQL to generate human-readable descriptions:
  // "SELECT * FROM ai_traces_unified WHERE timestamp >= subtractHours(now(), 3)"
  // → "ai_traces_unified: 3h timespan (100 rows)"
  
  const filters = [];
  if (timePattern) filters.push(`${hours}h timespan`);
  if (servicePattern) filters.push(`service: ${service}`);
  if (pathPattern) filters.push(`path: ${path}`);
  
  return `${tableName}: ${filters.join(', ')}`;
};
```

## Dual Ingestion Architecture

### Unified Data Model

The UI displays traces from two ingestion paths through a unified interface:

```sql
-- Materialized view combining both schemas
CREATE MATERIALIZED VIEW ai_traces_unified AS
SELECT 
  -- Collector path (OTLP native schema)
  TraceId as trace_id,
  ServiceName as service_name,
  SpanName as operation_name,
  Duration / 1000000 as duration_ms,
  'collector' as ingestion_path,
  'otlp-native' as schema_version
FROM otel.otel_traces

UNION ALL

SELECT
  -- Direct path (custom schema)  
  trace_id,
  service_name,
  operation_name,
  duration / 1000000 as duration_ms,
  'direct' as ingestion_path,
  'custom' as schema_version
FROM otel.traces;
```

### Visual Differentiation

- **Ingestion Path Column**: Shows "collector" or "direct" for each trace
- **Schema Version Indicator**: "otlp-native" vs "custom" labeling
- **Color Coding**: Subtle visual distinction between ingestion paths
- **Filter Capabilities**: Query by ingestion path or schema type

## Development Workflow

### Screenshot Management

```bash
# Development workflow
1. Take screenshot → save to screenshots-dropbox/
2. Run ./scripts/create-pr-claude.sh
3. Claude Code organizes screenshots by package and date
4. Screenshots automatically referenced in PR and blog posts
```

### Development Commands

```bash
# Development
pnpm dev:web        # Start web development server
pnpm dev:electron   # Start Electron development mode  
pnpm dev            # Start both web and electron concurrently

# Building
pnpm build:web      # Build web application
pnpm build:electron # Build Electron desktop app
pnpm build          # Build both targets

# Quality
pnpm lint           # ESLint code checking
pnpm type-check     # TypeScript type validation
```

## Performance Characteristics

### Query Performance
- **Query Execution**: 50-500ms depending on data size and complexity
- **Results Rendering**: <100ms for typical result sets
- **History Search**: Instant (<10ms) local filtering
- **SQL Formatting**: <50ms with syntax fixing

### UI Performance
- **Panel Resizing**: 60fps smooth dragging
- **Editor Operations**: <10ms for typical editing operations
- **Monaco Loading**: <500ms initial load, cached thereafter
- **Results Scrolling**: Virtualized for large datasets

### Memory Usage
- **Base Application**: ~50MB
- **Monaco Editor**: ~30MB  
- **Query Results**: ~1MB per 1000 traces
- **Query History**: <1MB for 100 historical queries

## Future Enhancements

### Planned Features
- **Query Templates**: Pre-built queries for common use cases
- **Export Capabilities**: CSV, JSON, and image export of results
- **Advanced Filtering**: GUI-based filter builder
- **Real-time Queries**: Streaming results for live data
- **Multiple Tabs**: Support for multiple concurrent queries
- **Collaboration**: Shared queries and result snapshots

### Architecture Evolution
- **Plugin System**: Extensible query functions and visualizations  
- **Custom Dashboards**: Saved query combinations with layouts
- **AI Query Assistant**: Natural language to SQL conversion
- **Advanced Charts**: ECharts integration for visualization beyond tables

## Change Log

### 2025-08-20 - Encoding Type UI Enhancements
- **Visual Indicators**: Added "Encoding" column with orange (JSON) and blue (Protobuf) tags
- **Trace Classification**: UI now displays encoding type for each trace (JSON vs Protobuf)
- **Filter Support**: Added filter capabilities for JSON and Protobuf traces
- **Statistics Display**: Statistics bar shows Protobuf and JSON trace counts
- **Trace Details Modal**: Shows encoding type in modal header and description
- **Query Enhancement**: Updated DEFAULT_QUERY to include encoding_type field
- **Integration Testing**: Added comprehensive JSON OTLP testing with encoding validation
- **DateTime Compatibility**: Fixed datetime formatting for ClickHouse DateTime64 support

### 2025-08-15 - Initial Implementation
- **Core Features**: Monaco SQL editor with ClickHouse integration
- **Resizable Interface**: Professional drag-to-resize panels (30%/70% default)
- **Query Management**: Smart history with auto-generated descriptions
- **Dual Ingestion**: Unified visualization of collector + direct OTLP paths
- **Development Stack**: TypeScript 2022, pnpm, Electron + React
- **CORS Resolution**: Vite proxy configuration for seamless development
- **Error Handling**: SQL function auto-correction and validation
- **State Persistence**: Local storage with migration for breaking changes
- **Screenshot Workflow**: Dropbox system for PR and blog organization