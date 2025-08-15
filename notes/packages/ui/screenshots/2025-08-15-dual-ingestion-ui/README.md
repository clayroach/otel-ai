# UI Package Screenshots - Dual Ingestion Implementation

## Feature: Complete Dual Ingestion UI with Monaco SQL Editor

**Date**: 2025-08-15
**Package**: UI
**Feature**: Dual ingestion visualization with professional SQL interface

### Screenshot: ui-dual-ingestion-complete.png

This screenshot demonstrates the completed UI implementation showing:

#### Core Features Visible:
- **Monaco SQL Editor** (left panel, 30%): Professional SQL editor with ClickHouse syntax highlighting
- **Resizable Interface**: Draggable splitter between query editor and results
- **Query Results** (right panel, 70%): Tabular display of trace data with sorting and pagination
- **Dual Ingestion Visualization**: Clear distinction between collector and direct OTLP paths

#### Technical Details Shown:
- **Query**: Unified traces query across both ingestion paths
- **Results**: 12 total traces from both collector (10 traces) and direct (2 traces) paths
- **Ingestion Path Indicators**: 
  - Blue "Collector" tags for OTLP collector traces
  - Orange "Direct" tags for direct ingestion traces
- **Schema Differentiation**: "otlp-native" vs "custom" schema versions
- **Service Names**: Multiple services (rect-ingestion-service, st-telemetry-generator)

#### UI Components Demonstrated:
- Time range selector (Quick ranges: 08/15 10:53:29 - 08/15 11:53:29)
- Query execution controls (Run Query button)
- Editor toolbar with History dropdown
- Results table with sortable columns
- Status indicators (green checkmarks for successful operations)
- Pagination controls (1-12 of 12 traces shown)

#### Performance Metrics:
- **Total Results**: 12 traces
- **Error Count**: 1 error trace visible
- **Average Duration**: 527ms
- **Services Count**: 2 services represented

This screenshot serves as the hero image for the PR and demonstrates the successful implementation of all requested features:
- Resizable panels with professional drag-to-resize functionality
- Complete dual ingestion architecture visualization
- Monaco editor integration with ClickHouse support
- Query history and formatting capabilities