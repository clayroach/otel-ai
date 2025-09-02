# Feature-001: Critical Request Paths Topology

**Feature ID**: FEAT-001  
**Status**: Design Phase  
**Created**: 2025-09-02  
**Author**: Claude Code with Human Architect  
**Priority**: High  
**Target Release**: Sprint 1  

## Executive Summary

Implement an advanced topology visualization system that uses Critical Request Paths as the primary navigation and filtering mechanism for service topology analysis. This feature transforms the existing topology view into an intelligent, path-aware system that helps users understand and analyze their distributed system's most important request flows.

## Problem Statement

Current topology visualizations show all services equally, making it difficult to:
- Identify critical paths through the system
- Focus on specific request flows that matter most
- Understand service dependencies in context of actual usage patterns
- Correlate AI insights with specific service paths

## Solution Overview

### Three-Panel Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Critical Request Paths Topology          │
├──────────────┬──────────────────────────┬──────────────────┤
│              │                          │                  │
│   Critical   │    Service Topology      │   AI-Powered    │
│   Request    │       Graph              │   Architecture  │
│   Paths      │                          │   Analysis      │
│   (10-15%)   │       (50-55%)           │    (30-35%)     │
│              │                          │                  │
│  ┌────────┐  │    ┌───┐    ┌───┐      │  ┌────────────┐ │
│  │ Path 1 │  │    │ A ├────┤ B │      │  │  Global    │ │
│  ├────────┤  │    └─┬─┘    └─┬─┘      │  │  Insights  │ │
│  │ Path 2 │  │      │        │        │  ├────────────┤ │
│  ├────────┤  │    ┌─┴─┐    ┌─┴─┐      │  │  Service   │ │
│  │ Path 3 │  │    │ C │    │ D │      │  │  Details   │ │
│  └────────┘  │    └───┘    └───┘      │  └────────────┘ │
└──────────────┴──────────────────────────┴──────────────────┘
```

## Detailed Requirements

### 1. Critical Request Paths Panel (Left)

#### Visual Design
- **Width**: 10-15% of viewport (minimum 150px, maximum 250px)
- **Style**: Card-based list with hover effects
- **Scrollable**: Independent scroll for long path lists

#### Functionality
- **Path Selection**: 
  - Single-click to filter topology
  - Multi-select with Ctrl/Cmd for comparing paths
  - "Show All" option to display complete topology
- **Path Information**:
  - Path name/identifier
  - Request count/frequency
  - Average latency
  - Error rate indicator
  - Service count badge

#### Data Structure
```typescript
interface CriticalPath {
  id: string
  name: string
  description?: string
  services: string[]
  edges: Array<{source: string, target: string}>
  metrics: {
    requestCount: number
    avgLatency: number
    errorRate: number
    p99Latency: number
  }
  priority: 'critical' | 'high' | 'medium' | 'low'
  lastUpdated: Date
}
```

### 2. Service Topology Graph (Center)

#### Visual Enhancements
- **Filtered View**: Only show services/edges in selected paths
- **Path Highlighting**: 
  - Selected path edges: Bold, animated flow
  - Non-path services: Greyed out/reduced opacity
  - Multi-path selection: Different colors per path
- **Interactive Elements**:
  - Click service node → Open service details tab
  - Hover → Show quick metrics tooltip
  - Right-click → Context menu with actions

#### Graph Modifications
```typescript
interface TopologyGraphProps {
  selectedPaths: CriticalPath[]
  highlightMode: 'exclusive' | 'emphasis' | 'comparison'
  onServiceClick: (serviceId: string) => void
  animateFlow: boolean
  showMetrics: boolean
}
```

### 3. AI-Powered Architecture Analysis (Right)

#### Tab System
- **Global Tab**: Overall system insights (default)
- **Service Tabs**: Created dynamically when clicking services
- **Tab Management**:
  - Maximum 5 tabs open simultaneously
  - Close button on each tab
  - Tab overflow with dropdown menu

#### Content Types
```typescript
interface AnalysisPanel {
  type: 'global' | 'service'
  targetId?: string // service ID if type === 'service'
  content: {
    summary: string
    insights: Insight[]
    recommendations: Recommendation[]
    metrics: ServiceMetrics | SystemMetrics
    aiModel: 'gpt-4' | 'claude' | 'llama'
  }
}
```

## Implementation Checklist

### Phase 1: Layout Restructuring ✅ Status: Not Started
- [ ] Create three-panel layout component
- [ ] Implement responsive sizing with constraints
- [ ] Add panel resize handlers
- [ ] Ensure mobile responsiveness fallback

### Phase 2: Critical Paths Panel ✅ Status: Not Started
- [ ] Design path list component
- [ ] Implement path selection logic
- [ ] Add multi-select functionality
- [ ] Create path metrics display
- [ ] Add search/filter for paths
- [ ] Implement path sorting options

### Phase 3: Topology Graph Integration ✅ Status: Not Started
- [ ] Modify graph to accept path filters
- [ ] Implement edge highlighting logic
- [ ] Add animated flow visualization
- [ ] Create service click handlers
- [ ] Update graph layout algorithm for filtered views
- [ ] Add transition animations for filter changes

### Phase 4: AI Analysis Panel ✅ Status: Not Started
- [ ] Create tab component system
- [ ] Implement global insights view
- [ ] Build service-specific analysis view
- [ ] Add tab management logic
- [ ] Integrate with AI analyzer service
- [ ] Add real-time update capability

### Phase 5: Data Integration ✅ Status: Not Started
- [ ] Connect to backend for critical paths data
- [ ] Implement path calculation algorithm
- [ ] Add WebSocket for real-time updates
- [ ] Create caching layer for performance
- [ ] Add error handling and fallbacks

### Phase 6: Testing & Polish ✅ Status: Not Started
- [ ] Unit tests for all components
- [ ] Integration tests for panel interactions
- [ ] E2E tests for complete workflow
- [ ] Performance optimization
- [ ] Accessibility compliance
- [ ] Documentation updates

## Technical Architecture

### Component Hierarchy
```
CriticalRequestPathsTopology/
├── CriticalPathsPanel/
│   ├── PathList.tsx
│   ├── PathItem.tsx
│   └── PathMetrics.tsx
├── TopologyGraph/
│   ├── ServiceNode.tsx
│   ├── PathEdge.tsx
│   └── GraphControls.tsx
└── AIAnalysisPanel/
    ├── TabManager.tsx
    ├── GlobalInsights.tsx
    └── ServiceInsights.tsx
```

### State Management
```typescript
interface TopologyState {
  // Path selection
  availablePaths: CriticalPath[]
  selectedPaths: string[]
  pathFilter: 'all' | 'critical' | 'errors' | 'slow'
  
  // Graph state
  graphData: TopologyData
  highlightedServices: Set<string>
  animationEnabled: boolean
  
  // Analysis state
  activeTabs: AnalysisTab[]
  activeTabId: string
  insights: Map<string, AnalysisContent>
  
  // UI state
  panelSizes: {
    paths: number
    topology: number
    analysis: number
  }
}
```

### API Endpoints
```typescript
// Critical Paths API
GET /api/v1/critical-paths
POST /api/v1/critical-paths/calculate
GET /api/v1/critical-paths/:pathId

// Service Analysis API  
GET /api/v1/services/:serviceId/analysis
GET /api/v1/services/:serviceId/ai-insights
POST /api/v1/services/:serviceId/analyze

// Real-time Updates
WS /api/v1/topology/stream
WS /api/v1/paths/updates
```

## User Interactions

### Workflow 1: Exploring Critical Paths
1. User opens topology view
2. Sees list of critical paths on left
3. Clicks a path → Graph filters to show only that path
4. Sees highlighted services and edges
5. Views global AI insights for the path

### Workflow 2: Service Deep Dive
1. User has path selected
2. Clicks on a service node in graph
3. New tab opens in right panel
4. Shows service-specific AI insights
5. Can compare with other services by opening more tabs

### Workflow 3: Multi-Path Comparison
1. User Ctrl+clicks multiple paths
2. Graph shows all selected paths in different colors
3. Can see overlapping services
4. AI panel shows comparative analysis

## Performance Considerations

### Optimization Strategies
- **Virtual scrolling** for long path lists
- **Debounced graph updates** during filtering
- **Lazy loading** of service details
- **Memoization** of expensive calculations
- **Web Workers** for path computation

### Target Metrics
- Initial load: < 2 seconds
- Path selection response: < 100ms
- Graph filter animation: 60 fps
- Tab switch: < 50ms
- AI insights load: < 3 seconds

## Migration Strategy

### From Current Implementation
1. **Preserve existing components** where possible
2. **Gradual migration** with feature flags
3. **Backward compatibility** for existing URLs
4. **Data migration** for saved views/filters

### Rollback Plan
- Feature flag to disable new layout
- Maintain old components for 2 releases
- Database migrations are reversible
- API versions maintained

## Success Metrics

### Quantitative
- **Path identification time**: 50% reduction
- **Mean time to insight**: 30% improvement
- **User engagement**: 40% increase in feature usage
- **Performance**: All operations under target times

### Qualitative
- User satisfaction scores
- Feature adoption rate
- Support ticket reduction
- Developer feedback positive

## Future Enhancements

### Version 2.0
- Path recording from production traffic
- Automated critical path detection
- Path performance predictions
- Anomaly detection per path

### Version 3.0
- Path-based alerting rules
- Automated remediation suggestions
- Path cost analysis
- Multi-cluster path visualization

## Dependencies

### Technical
- React 18+ for concurrent features
- D3.js for graph visualization
- Ant Design for UI components
- Effect-TS for data processing
- WebSocket for real-time updates

### Service
- AI Analyzer service for insights
- Storage service for metrics
- Config Manager for settings
- LLM Manager for AI models

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation with many paths | High | Implement pagination and virtual scrolling |
| Complex state management | Medium | Use proper state management patterns |
| Browser compatibility issues | Low | Test on all major browsers |
| API response times | Medium | Add caching and optimization |

## Approval & Sign-off

- [ ] Product Owner approval
- [ ] Technical Lead review
- [ ] UX/UI design approval
- [ ] Security review completed
- [ ] Performance baseline established

---

## Session Recovery Checkpoint System

### Implementation Status Tracking
Each checklist item has a status indicator:
- ⬜ Not Started
- 🟦 In Progress (include last file edited)
- ✅ Completed (include commit hash if applicable)
- ❌ Blocked (include blocker description)

### Session State Persistence
```yaml
last_session:
  timestamp: 2025-09-02T11:30:00Z
  current_phase: "Phase 3: Topology Graph Integration"
  current_task: "Implement edge highlighting logic for selected paths"
  files_modified:
    - ui/src/components/CriticalRequestPathsTopology/index.tsx
    - ui/src/components/CriticalRequestPathsTopology/types.ts
    - ui/src/components/CriticalRequestPathsTopology/CriticalPathsPanel.tsx
    - ui/src/components/CriticalRequestPathsTopology/AIAnalysisPanel.tsx
    - ui/src/components/CriticalRequestPathsTopology/styles.css
    - ui/src/components/TopologyChart/TopologyTab.tsx
    - ui/src/views/InsightsView/AIAnalyzerView.tsx
  completed_tasks:
    - "Created three-panel layout component ✅"
    - "Implemented Critical Paths Panel with full functionality ✅"
    - "Implemented AI Analysis Panel with tab management ✅"
    - "Integrated into AIAnalyzerView ✅"
  pending_tasks:
    - "Complete edge highlighting in topology graph"
    - "Add panel resize handlers"
    - "Connect to real backend data"
  blockers: []
  notes: "Three-panel layout working with mock data. Need to complete topology graph path highlighting and connect to real backend services."
  verification:
    - "Components created and integrated"
    - "Ready for UI testing at localhost:5173/insights"
```

### Recovery Instructions
When resuming work on this feature:
1. Check `last_session` section for current state
2. Review files_modified to understand changes
3. Continue with pending_tasks
4. Update status indicators as work progresses
5. Commit checkpoint updates to this document

This design document serves as both the implementation guide and the session recovery mechanism, ensuring continuity across Claude Code sessions.