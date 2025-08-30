# ADR-013: Topology Overview with Force-Directed Graph Visualization

## Status

**IN PROGRESS** - Implementation underway

## Context

The AI Analyzer screen needs a dynamic topology overview to visualize service relationships, health states, and performance characteristics. Users need to understand system architecture at a glance, identify bottlenecks, and quickly navigate to problematic services based on R.E.D metrics (Rate, Errors, Duration).

Current observability tools like AppDynamics, Dynatrace, New Relic, and Honeycomb provide excellent topology visualizations that we want to match or exceed in quality and functionality.

## Decision

We will implement a **force-directed graph topology visualization** using Apache ECharts as the primary charting library, leveraging the existing AI analyzer infrastructure for data processing and extending it with visualization-specific enhancements.

### Architecture Approach

**Build on Existing AI Analyzer Foundation:**
- ✅ Leverage existing `ArchitectureQueries` for service discovery and relationships
- ✅ Extend existing `ServiceTopologyRaw` interface with visualization data
- ✅ Enhance existing `discoverApplicationTopology` function with health calculations
- ✅ Use existing Effect-TS patterns for data processing and error handling

**New Components:**
- Apache ECharts force-directed graph component
- Interactive service details panel
- Runtime environment legend with filtering
- Real-time WebSocket updates

## Visual Design Specifications

### Graph Components

#### Service Nodes
- **Shape**: Circular nodes representing individual services
- **Size**: Proportional to service activity/importance (span count)
- **Health Color Coding**:
  - 🟢 **Green**: Healthy (all R.E.D metrics within thresholds)
  - 🟡 **Yellow**: Warning (1 metric approaching threshold)
  - 🟠 **Orange**: Degraded (1 metric exceeding threshold)
  - 🔴 **Red**: Critical (multiple metrics exceeding thresholds)
  - ⚫ **Black**: Service unavailable/completely failed

#### Service Relationships (Edges)
- **Thickness**: Proportional to call volume between services
  - Thin: < 10 calls/minute
  - Medium: 10-100 calls/minute  
  - Thick: 100-1000 calls/minute
  - Very Thick: > 1000 calls/minute
- **Color**: Matches downstream service health state
- **Direction**: Arrows indicating call direction (caller → callee)

#### Runtime Environment Icons
Language-specific icons overlaid on service nodes:
- ☕ **Java**, 🔷 **C#/.NET**, 💎 **Ruby**, 🐹 **Go**, 🐘 **PHP**, 🐍 **Python**, ⚡ **Node.js**, 🦀 **Rust**, 🔥 **Generic**

### R.E.D Metrics Thresholds

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **Rate** | Baseline ±20% | ±20-50% deviation | >50% deviation |
| **Errors** | <1% error rate | 1-5% error rate | >5% error rate |
| **Duration** | <100ms P95 | 100-500ms P95 | >500ms P95 |

## Technical Implementation

### Data Layer Extensions

**Enhanced Type Definitions:**
```typescript
interface TopologyVisualizationData extends ApplicationArchitecture {
  nodes: ServiceNode[]
  edges: ServiceEdge[]
  runtimeEnvironments: RuntimeEnvironment[]
  healthSummary: HealthSummary
}

interface ServiceNode {
  id: string
  name: string
  category: RuntimeEnvironment
  symbolSize: number
  itemStyle: { color: HealthColor }
  metrics: REDMetrics
  position?: [number, number] // For layout persistence
}

interface ServiceEdge {
  source: string
  target: string
  value: number // Call volume
  lineStyle: { width: number, color: HealthColor }
}
```

**Runtime Environment Detection Query:**
```sql
SELECT 
    service_name,
    extractAll(resource_attributes, '"telemetry.sdk.language":"([^"]+)"')[1] as runtime_language,
    extractAll(resource_attributes, '"process.runtime.name":"([^"]+)"')[1] as runtime_name,
    extractAll(span_attributes, '"component":"([^"]+)"')[1] as component
FROM traces
WHERE start_time >= now() - INTERVAL 24 HOUR
GROUP BY service_name
```

### Apache ECharts Configuration

```typescript
const topologyOption = {
  title: { text: 'Service Topology Overview', left: 'center' },
  animationDurationUpdate: 1500,
  animationEasingUpdate: 'quinticInOut',
  series: [{
    type: 'graph',
    layout: 'force',
    data: serviceNodes,
    links: serviceEdges,
    categories: runtimeCategories,
    roam: true,
    force: {
      repulsion: 1000,
      edgeLength: [50, 200],
      gravity: 0.1
    },
    emphasis: { focus: 'adjacency' }
  }]
}
```

### UI Integration Points

**AI Analyzer Screen Layout:**
- **Top 70%**: Topology overview with force-directed graph
- **Bottom 30%**: Service details panel with R.E.D metrics
- **Side Panel**: Runtime environment legend and health filters

**Interactive Features:**
1. **Click Node**: Show detailed R.E.D metrics in bottom panel
2. **Hover Node**: Display tooltip with key metrics
3. **Click Edge**: Show trace samples between services
4. **Filter Panel**: Filter by runtime, health status, time range
5. **Real-time Updates**: WebSocket updates every 30 seconds

## Implementation Plan & Progress Tracking

### Phase 1: Data Layer Extensions ✅ COMPLETE
- [x] **Task 1**: Extend `ServiceTopologyRaw` interface with health and runtime fields
- [x] **Task 2**: Add runtime environment detection to `ArchitectureQueries`  
- [x] **Task 3**: Enhance `discoverApplicationTopology` with health status calculations
- [x] **Task 4**: Create `TopologyVisualizationData` type extending `ApplicationArchitecture`
- [x] **Task 5**: Add call volume metrics to `buildDependencyGraph`
- [x] **Task 6**: Create topology API endpoint using existing service structure

### Phase 2: UI Components ✅ COMPLETE
- [x] **Task 7**: Implement `TopologyChart` component with Apache ECharts
- [x] **Task 8**: Add node styling (health colors, runtime icons, sizing)
  - Implemented pie-chart style nodes with 4 quadrants for RED + OTel metrics
  - Each quadrant color-coded based on thresholds
- [x] **Task 9**: Implement edge styling (thickness based on call volume)
  - Added directed arrows to edges
  - Dynamic thickness based on call volume
  - Operation-level breakdown on hover
- [x] **Task 10**: Create `ServiceDetailsPanel` for metrics display
- [x] **Task 11**: Add R.E.D metrics charts in details panel
  - Enhanced panel shows clear threshold violations
  - Explains WHY services are marked as critical/warning
- [x] **Task 12**: Create `RuntimeLegend` with icons and filters

### Phase 3: Interactivity ✅ COMPLETE
- [x] **Task 13**: Implement click handler for node selection
- [x] **Task 14**: Add hover tooltips for nodes and edges
  - Enhanced tooltips show operation breakdown for edges
  - Node tooltips show all metrics with color coding
- [x] **Task 15**: Create `TopologyTab` and integrate into `InsightsView`
- [x] **Task 16**: Add data fetching using existing AI analyzer patterns
- [x] **Task 17**: Implement real-time WebSocket updates
  - Created `useTopologyWebSocket` hook
  - `TopologyTabRealtime` component with WebSocket support
- [x] **Task 18**: Add loading states and error handling
- [x] **Task 19**: Add health status filtering
  - Clickable health badges to filter nodes
  - Show only services with specific health states

### Phase 4: Quality Assurance 🚧 IN PROGRESS
- [x] **Task 20**: Create unit tests extending existing patterns
- [x] **Task 21**: Add integration tests for topology visualization
- [ ] **Task 22**: Update AI Analyzer documentation
- [ ] **Task 23**: Test with live demo data to ensure all services appear
- [ ] **Task 24**: Run type check and lint to ensure code quality

## Recent Enhancements (2025-08-29)

### User Feedback Addressed

1. [ ] **Pie-chart nodes**: Nodes divided into 4 sections for RED + OTel metrics
   - Implemented in `PieNodeTopologyChart` with 4 colored segments per node
   - Each quadrant independently colored based on metric thresholds
2. [ ] **Clear health explanations**: Details panel explains WHY services are unhealthy
   - `EnhancedServiceDetailsPanel` shows threshold violations
3. [ ] **Tab reorganization**: Topology graph moved to main Overview tab
   - Metadata/analysis info moved to pre-collapsed card above tabs
   - Topology graph is now the primary content in Overview tab
4. [ ] **Health filtering**: Service health statuses are clickable for filtering
   - Clickable badges to filter by health status
5. [ ] **Directed edges**: Arrows show direction of service calls
   - Arrows added to show call direction
6. [ ] **Operation breakdown**: Hovering edges shows operation-level details
   - Tooltip shows operation-level metrics on edge hover
7. [ ] **Icon duplication fix**: Fixed duplicate runtime icons on nodes
   - Check for existing icons before adding

### Components Created
- `UltimateTopologyChart` - Main topology visualization with all enhancements
- `EnhancedServiceDetailsPanel` - Detailed panel with threshold explanations
- `TopologyTabRealtime` - WebSocket-enabled real-time updates
- `RuntimeLegend` - Filter component for runtime and health states
- `useTopologyWebSocket` - Hook for WebSocket connections

### Remaining Tasks
- [ ] Investigate missing services from demo application
- [ ] Test with live OpenTelemetry demo data
- [ ] Performance optimization for large topologies (>200 services)
- [ ] Add node clustering for better visualization at scale
- [ ] Documentation updates

## Performance Requirements

- **Initial Load**: <2 seconds for topology with 100+ services
- **Update Time**: <500ms for real-time changes
- **Smooth Interactions**: 60fps animations and transitions
- **Memory Efficiency**: Selective updates for real-time changes

## Alternative Approaches Considered

### D3.js Force-Directed Graphs
- **Pros**: Maximum customization, high performance
- **Cons**: Higher development complexity, more code to maintain
- **Decision**: Rejected in favor of Apache ECharts for faster implementation

### Cytoscape.js
- **Pros**: Purpose-built for network graphs, rich feature set
- **Cons**: Additional dependency, different API patterns
- **Decision**: Keep as fallback if ECharts proves insufficient

### Vis.js Network
- **Pros**: Good physics simulation, established library
- **Cons**: Less actively maintained, older API patterns
- **Decision**: Not chosen due to maintenance concerns

## Success Metrics

### Visual Quality
- Clear service relationship representation
- Intuitive health state indication  
- Responsive layout on different screen sizes
- Runtime environment icons clearly visible

### Performance
- Initial load time <2 seconds
- Real-time update latency <500ms
- Smooth interactions with 100+ services
- No memory leaks during extended usage

### User Experience
- Intuitive navigation and exploration
- Clear information hierarchy
- Actionable insights from visual cues
- Seamless integration with existing AI Analyzer workflow

## Consequences

### Positive
- **Leverages Existing Infrastructure**: Builds on robust AI analyzer foundation
- **Industry-Standard Visualization**: Force-directed graphs familiar to APM users
- **Real-time Insights**: Live topology updates provide current system state
- **Extensible Design**: Foundation for advanced features like anomaly detection

### Negative
- **Complexity**: Additional UI complexity in AI Analyzer screen
- **Performance Overhead**: Real-time updates may impact browser performance
- **Maintenance Burden**: Another component requiring ongoing updates

### Risks & Mitigations
- **Risk**: Apache ECharts performance with large graphs (>200 services)
  - **Mitigation**: Implement node clustering and level-of-detail rendering
- **Risk**: Real-time updates overwhelming the UI
  - **Mitigation**: Implement selective updates and batching strategies

---

**Decision Date**: 2025-08-29  
**Last Updated**: 2025-08-29  
**Next Review**: After Phase 1 completion

*This ADR documents the decision to implement topology visualization as an extension of the existing AI analyzer, providing a foundation for enhanced observability and system understanding.*