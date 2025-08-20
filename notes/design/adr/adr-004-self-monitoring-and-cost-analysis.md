# ADR-004: Self-Monitoring and Cost Analysis Framework

## Status

Proposed

## Context

An AI-native observability platform should demonstrate self-monitoring capabilities and provide cost analysis for all components, including LLM API usage. This aligns with the philosophy of automation and efficiency.

## Decision

Implement a **comprehensive self-monitoring and cost analysis framework** that tracks costs and performance at every level of the system.

## Scope of Monitoring

### Infrastructure Costs
- **ClickHouse storage** usage and query costs
- **S3 storage** for ClickHouse backend (bytes stored, requests)
- **Container resource** usage (CPU, memory, network)
- **OpenTelemetry Collector** processing overhead

### LLM API Costs
- **OpenAI API** token usage and costs per request
- **Claude API** token usage and costs per request  
- **Gemini API** token usage and costs per request
- **Per-trace cost analysis** using API keys from trace headers

### Application Performance
- **Query response times** for ClickHouse operations
- **Memory usage** for protobuf processing
- **Bundle size** and load times for frontend
- **WebSocket connection** efficiency for real-time features

## Implementation Strategy

### Phase 1: Cost Tracking Infrastructure
```typescript
interface CostMetric {
  service: 'openai' | 'claude' | 'gemini' | 'clickhouse' | 's3'
  operation: string
  tokens?: number
  bytes?: number
  cost_usd: number
  timestamp: DateTime
  trace_id?: string
  user_id?: string
}
```

### Phase 2: LLM API Integration
- **Extract API keys** from trace headers for cost attribution
- **Track token usage** for each LLM call
- **Real-time cost calculation** using current API pricing
- **Cost alerts** when usage exceeds thresholds

### Phase 3: Self-Monitoring Dashboard
- **Cost breakdown** by service and operation
- **Usage trends** over time
- **Cost per trace** analysis
- **Efficiency metrics** (cost per insight generated)

## Technical Implementation

### Cost Collection
```typescript
// Cost tracking service
export class CostTracker {
  async recordLLMCost(params: {
    provider: 'openai' | 'claude' | 'gemini'
    model: string
    input_tokens: number
    output_tokens: number
    trace_id?: string
  }): Promise<void>
  
  async recordStorageCost(params: {
    service: 'clickhouse' | 's3'
    operation: string
    bytes: number
    trace_id?: string
  }): Promise<void>
}
```

### API Key Extraction
- **Trace headers** contain API keys for automatic cost attribution
- **Per-user cost tracking** based on API key ownership
- **Automatic billing** integration possibilities

### Storage Strategy
- **ClickHouse table** for cost metrics (same storage as traces)
- **Real-time aggregation** for dashboard updates
- **Historical cost analysis** with trend detection

## Self-Monitoring Benefits

### Cost Optimization
- **Identify expensive operations** for optimization
- **Track ROI** of LLM API usage
- **Optimize resource allocation** based on actual usage

### Transparency
- **Full cost visibility** for all operations
- **Cost attribution** to specific traces and users
- **Budget planning** with historical data

### Efficiency Measurement
- **Cost per feature delivered** metrics
- **Resource utilization** optimization
- **Performance vs. cost** trade-off analysis

## Integration with S3 Strategy

### ClickHouse S3 Backend
- **Cold storage** for older traces in S3
- **Cost tracking** for S3 storage and retrieval
- **Automatic tiering** based on access patterns

### Benefits
- **Reduced storage costs** for historical data
- **Scalable storage** without infrastructure management
- **Cost-effective long-term retention**

## Success Metrics

- **Complete cost visibility** across all services
- **Real-time cost tracking** with <1 minute latency
- **Cost optimization** opportunities identified weekly
- **Self-monitoring demonstrates** platform capabilities to users