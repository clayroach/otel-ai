# ADR-007: Contextual Data Selection Beyond Time Ranges

## Status
Proposed

## Context
Current observability tools, including our AI analyzer, rely primarily on time-based data selection (e.g., "last hour", "last 24 hours"). However, during incident investigation and system analysis, engineers often think in terms of contextual events and conditions rather than specific timestamps.

### Current Limitations
- **Time-centric selection**: Users must translate contextual understanding into time ranges
- **Static boundaries**: Fixed time windows don't align with dynamic system behaviors
- **Investigation friction**: Engineers know "when the spike happened" but must hunt for the exact time range
- **Context loss**: Important system state changes get lost in arbitrary time boundaries

### Real-World Investigation Patterns
Engineers typically investigate using contextual markers:
- "When traffic spiked to 10x normal"
- "After we deployed version 2.1.3"
- "When service-y first appeared in the topology"
- "During the error rate increase"
- "Between the two deployment events"
- "When latency crossed the SLA threshold"

## Decision
Implement a **Contextual Data Selection System** that allows users to select data ranges based on system events, conditions, and behavioral patterns rather than just time boundaries.

## Design

### Core Components

#### 1. Event Timeline Discovery
```typescript
interface SystemEvent {
  id: string
  type: 'deployment' | 'traffic_spike' | 'error_spike' | 'service_discovery' | 'threshold_breach' | 'custom'
  timestamp: Date
  duration?: number
  description: string
  confidence: number
  metadata: {
    services?: string[]
    metrics?: Record<string, number>
    tags?: string[]
  }
}
```

#### 2. Contextual Range Selectors
- **Traffic Pattern Selection**: "During 5x traffic spike" → Auto-detect traffic anomalies
- **Service Lifecycle**: "From service-X first appearance" → Track service topology changes  
- **Performance Thresholds**: "When P95 latency > 2s" → Metric-based boundaries
- **Deployment Boundaries**: "Between v2.1.2 and v2.1.3 deploy" → Release-based ranges
- **Error Correlation**: "During error rate spike in service-Y" → Error pattern boundaries

#### 3. Smart Time Range Inference
```typescript
interface ContextualRange {
  type: 'traffic_anomaly' | 'deployment_window' | 'service_lifecycle' | 'threshold_breach'
  description: string
  startTime: Date
  endTime: Date
  confidence: number
  markers: {
    start: SystemEvent
    end?: SystemEvent
  }
  suggestedBuffer: {
    before: number // minutes
    after: number  // minutes
  }
}
```

### Implementation Phases

#### Phase 1: Event Detection Engine
- Implement automatic detection of:
  - Traffic anomalies (spikes, drops)
  - New service appearances/disappearances
  - Error rate changes
  - Latency threshold breaches
  - Deployment events (from traces/logs)

#### Phase 2: Contextual UI Components
```tsx
<ContextualTimeSelector>
  <EventTimeline />
  <QuickContexts>
    <Context>During last traffic spike</Context>
    <Context>Since service-X appeared</Context>
    <Context>During error spike in checkout</Context>
  </QuickContexts>
  <TraditionalRangePicker fallback />
</ContextualTimeSelector>
```

#### Phase 3: AI-Assisted Context Discovery
- LLM integration to suggest relevant contexts:
  - "I notice unusual patterns around 14:32 - investigate?"
  - "Service topology changed significantly at 09:15"
  - "Error correlation detected between these services"

#### Phase 4: Investigation Bookmarking
- Save interesting time ranges with context labels
- Share investigation contexts with team
- Build library of "known interesting periods"

### Technical Architecture

#### Event Detection Pipeline
```
Telemetry Stream → Event Detectors → Event Timeline → Context Generator
     ↓                    ↓              ↓             ↓
  Raw metrics    Traffic/Error/      Temporal       Suggested
  & traces       Service detectors   events db      contexts
```

#### Storage Design
```sql
-- Events table for contextual markers
CREATE TABLE system_events (
  id UUID PRIMARY KEY,
  type event_type NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  end_timestamp TIMESTAMP,
  description TEXT NOT NULL,
  confidence DECIMAL(3,2),
  services TEXT[], -- affected services
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User-saved contexts
CREATE TABLE investigation_contexts (
  id UUID PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  start_event_id UUID REFERENCES system_events(id),
  end_event_id UUID REFERENCES system_events(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  tags TEXT[],
  shared BOOLEAN DEFAULT FALSE
);
```

## Benefits

### For Engineers
- **Natural investigation flow**: Think in terms of system behavior, not timestamps
- **Faster context switching**: Jump between relevant time periods quickly
- **Reduced cognitive load**: System suggests meaningful boundaries
- **Better pattern recognition**: Visual timeline of system events

### For AI Analysis
- **Contextually-aware insights**: Analysis focused on meaningful system states
- **Event correlation**: Connect insights to specific system changes
- **Improved accuracy**: Analysis boundaries align with actual system behavior
- **Pattern learning**: Build knowledge of typical event sequences

### For Teams
- **Shared investigation contexts**: "Check the spike from yesterday" becomes clickable
- **Incident post-mortems**: Easy reference to exact problem periods
- **Knowledge building**: Accumulate understanding of system behavior patterns

## Implementation Considerations

### Data Requirements
- High-resolution metrics for anomaly detection
- Service topology change tracking
- Deployment/release correlation data
- Sufficient historical data for pattern recognition

### Performance Considerations
- Event detection must be near real-time
- Timeline queries need efficient indexing
- Context suggestions require fast pattern matching
- UI responsiveness during range updates

### User Experience
- Graceful fallback to traditional time pickers
- Progressive disclosure of advanced contextual features
- Visual timeline integration with existing UI
- Mobile-responsive contextual selection

## Future Extensions

### Advanced Contextual Intelligence
- **Causal chains**: "Select data from root cause through all effects"
- **Multi-service context**: "During the cascade failure across 3 services"
- **Business context**: "During Black Friday traffic pattern"
- **Predictive contexts**: "Before the predicted spike" (proactive investigation)

### Integration Patterns
- **Alerting integration**: "Investigate the period that triggered alert X"
- **Incident management**: "Import Jira incident timeline as context"
- **Release management**: "Show me the blast radius of release Y"
- **SLA tracking**: "Periods when we violated P95 SLA"

## Risks and Mitigations

### Risk: Event Detection False Positives
**Mitigation**: Confidence scoring, manual event curation, ML training feedback loops

### Risk: Cognitive Overload from Too Many Contexts
**Mitigation**: Smart filtering, user preferences, relevance ranking

### Risk: Performance Impact from Complex Queries
**Mitigation**: Materialized views, pre-computed event timelines, query optimization

### Risk: User Confusion with New Paradigm
**Mitigation**: Progressive enhancement, traditional fallbacks, onboarding tutorials

## Success Metrics

### Usage Metrics
- Adoption rate of contextual vs traditional time selection
- Time-to-insight reduction during investigations
- Context reuse and sharing frequency

### Quality Metrics
- Accuracy of auto-detected events
- User satisfaction with suggested contexts
- Reduction in "hunting for the right time range"

## Conclusion
Contextual data selection represents a fundamental shift from time-centric to behavior-centric observability. By aligning data boundaries with actual system events and investigation patterns, we can significantly improve the efficiency and effectiveness of system analysis and incident investigation.

This approach transforms observability from "show me metrics from 2-4pm" to "show me what happened during the checkout service cascade failure" - a much more natural and powerful way to understand system behavior.