# Feature-006: Model Selection via Portkey Gateway Integration

**Date**: 2025-01-12  
**Status**: In Design  
**Feature Number**: 006
**Related ADR**: [ADR-014: LLM Management Library Evaluation](../adr/adr-014-llm-management-library-evaluation.md)

## Overview

Feature-006 implements Phase 2 of ADR-014 by integrating Portkey as the LLM gateway for production-grade model routing, resilience, and observability. This replaces the custom LLM Manager's routing logic with a configuration-driven approach.

## Context from ADR-014

### Phase 1 Status (Completed ✅)
- Performance benchmarking complete
- CodeLlama-7b-instruct selected as primary local model (10.6s, zero cost)
- Hardcoded model references cleaned up
- All integration tests passing with valid diagnostic SQL

### Phase 2 Objective
Replace custom LLM Manager implementation with Portkey gateway to provide:
- Configuration-driven routing without code changes
- Automatic retries and fallback strategies
- Semantic caching for repeated queries
- Native OpenTelemetry integration
- Unified API for 1,600+ models

## Implementation Approach

### 1. Portkey Gateway Setup

#### Docker Deployment
```yaml
# docker-compose.yml addition
services:
  portkey-gateway:
    image: portkeyai/gateway:latest
    ports:
      - "8787:8787"
    environment:
      - PORT=8787
      - LOG_LEVEL=info
      - CACHE_ENABLED=true
      - CACHE_TTL=3600
    volumes:
      - ./config/portkey:/config
```

#### Configuration File
```yaml
# config/portkey/routing.yaml
version: "1.0"

# Model targets based on ADR-014 performance data
targets:
  - name: "local-primary"
    provider: "lm-studio"
    models: ["codellama-7b-instruct"]
    endpoint: "http://localhost:1234/v1"
    
  - name: "local-fallback"
    provider: "lm-studio" 
    models: ["sqlcoder-7b-2"]
    endpoint: "http://localhost:1234/v1"
    
  - name: "api-speed"
    provider: "openai"
    models: ["gpt-3.5-turbo"]
    api_key: "${OPENAI_API_KEY}"
    
  - name: "api-quality"
    provider: "anthropic"
    models: ["claude-3-haiku-20240307"]
    api_key: "${ANTHROPIC_API_KEY}"

# Routing rules
routes:
  # Speed-critical queries (< 7s required)
  - condition: 
      headers:
        x-priority: "high"
    target: "api-speed"
    
  # Complex diagnostic queries
  - condition:
      prompt_contains: ["complex", "sophisticated", "detailed"]
    target: "api-quality"
    
  # Default to local model
  - condition: "default"
    target: "local-primary"
    fallback: ["local-fallback", "api-speed"]

# Resilience configuration
retry:
  attempts: 3
  delay: 1000
  backoff: "exponential"

circuit_breaker:
  threshold: 5
  timeout: 30000
  half_open_requests: 2

# Caching for repeated queries
cache:
  enabled: true
  ttl: 3600
  semantic_similarity_threshold: 0.95
```

### 2. Client Integration

#### Replace LLM Manager with Portkey Client
```typescript
// src/llm-manager/portkey-client.ts
import { Effect, Layer } from 'effect'
import { Portkey } from '@portkey-ai/portkey-node'

export const PortkeyClient = Layer.effect(
  LLMManagerServiceTag,
  Effect.gen(function* () {
    const portkey = new Portkey({
      baseURL: process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787',
      config: 'config/portkey/routing.yaml'
    })
    
    return {
      generate: (request: LLMRequest) =>
        Effect.tryPromise({
          try: () => portkey.chat.completions.create({
            messages: [{ role: 'user', content: request.prompt }],
            metadata: {
              task: request.taskType,
              context: request.context
            },
            headers: {
              'x-priority': request.preferences?.priority || 'normal'
            }
          }),
          catch: (error) => new LLMError({ 
            _tag: 'ModelUnavailable',
            message: String(error)
          })
        }),
        
      getAvailableModels: () =>
        Effect.tryPromise({
          try: () => portkey.models.list(),
          catch: () => new LLMError({ _tag: 'ModelUnavailable' })
        })
    }
  })
)
```

### 3. UI Components

#### Model Status Display
The UI will show real-time model availability from Portkey:

```tsx
// ui/src/components/model-selector/ModelSelector.tsx
import { usePortkeyStatus } from '@/hooks/usePortkeyStatus'

export function ModelSelector() {
  const { models, selectedRoute, status } = usePortkeyStatus()
  
  return (
    <div className="model-selector">
      <div className="model-status">
        <h3>Active Route: {selectedRoute}</h3>
        <div className="model-list">
          {models.map(model => (
            <ModelItem 
              key={model.id}
              name={model.name}
              status={model.status}
              latency={model.avgLatency}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ModelItem({ name, status, latency }) {
  const statusColor = {
    available: '🟢',
    degraded: '🟡', 
    unavailable: '🔴'
  }[status]
  
  return (
    <div className="model-item">
      {statusColor} {name} ({latency}ms avg)
    </div>
  )
}
```

#### Integration with Query Generator
```tsx
// ui/src/components/query-generator/QueryGenerator.tsx
export function QueryGenerator() {
  const [priority, setPriority] = useState('normal')
  
  const generateQuery = async (prompt: string) => {
    // Portkey automatically handles routing based on config
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'x-priority': priority, // Influences Portkey routing
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    })
    
    return response.json()
  }
  
  return (
    <div>
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option value="normal">Normal (Local Models)</option>
        <option value="high">High Priority (Fast API)</option>
      </select>
      {/* Query generation UI */}
    </div>
  )
}
```

## Implementation Steps

### Phase 1: Portkey Setup
- [ ] Deploy Portkey gateway in development
- [ ] Create routing configuration based on ADR-014 model performance
- [ ] Test basic routing with existing query generator
- [ ] Benchmark performance vs current implementation

### Phase 2: Integration
- [ ] Replace LLM Manager service with Portkey client
- [ ] Update UI components to show Portkey status
- [ ] Implement semantic caching for repeated queries
- [ ] Add OpenTelemetry integration

### Phase 3: Deployment
- [ ] Deploy Portkey gateway to production
- [ ] Monitor performance and costs
- [ ] Fine-tune routing rules based on usage patterns
- [ ] Document configuration management

## Benefits Over Custom Solution

### From ADR-014 Analysis
1. **Eliminates 70%+ custom code** - No more manual routing logic
2. **Configuration-driven** - Change routing without code changes
3. **Production features** - Circuit breakers, retries, caching built-in
4. **Observability** - Native OpenTelemetry integration
5. **Cost optimization** - Automatic model selection based on requirements

### Specific Improvements
- **Response time**: Semantic caching reduces repeated query latency to <100ms
- **Reliability**: Automatic fallback when primary model unavailable
- **Flexibility**: Easy to add new models or change routing rules
- **Monitoring**: Built-in metrics and tracing

## Configuration Examples

### Development Environment
```yaml
# Prioritize local models for cost-free development
routes:
  - condition: "default"
    target: "local-primary"
    fallback: ["local-fallback"]
```

### Production Environment
```yaml
# Balance speed and cost based on priority
routes:
  - condition:
      headers:
        x-customer-tier: "premium"
    target: "api-speed"  # Fast responses for premium users
    
  - condition: "default"
    target: "local-primary"  # Cost-effective for standard users
    fallback: ["api-speed"]  # Fallback to API if local unavailable
```

### A/B Testing Configuration
```yaml
# Test new models with percentage-based routing
routes:
  - condition:
      percentage: 10  # 10% of requests
    target: "experimental-model"
    
  - condition: "default"
    target: "local-primary"
```

## Success Metrics

### Technical Metrics
- [ ] Portkey gateway deployed and routing successfully
- [ ] All existing tests pass with Portkey integration
- [ ] Response times meet or exceed current performance
- [ ] Semantic cache hit rate > 30% for repeated queries

### Business Metrics
- [ ] Reduced API costs through intelligent routing
- [ ] Improved response times for priority requests
- [ ] Simplified configuration management
- [ ] Better observability of model usage

## Risks and Mitigations

### Infrastructure Complexity
- **Risk**: Adding another service to manage
- **Mitigation**: Containerized deployment with health checks

### Configuration Management
- **Risk**: YAML routing rules become complex
- **Mitigation**: Start simple, version control configs, test thoroughly

### Network Latency
- **Risk**: Gateway adds overhead
- **Mitigation**: Deploy gateway close to services, use caching

## Conclusion

Feature-006 implements ADR-014 Phase 2 by integrating Portkey as the LLM gateway. This provides production-grade model routing, resilience, and observability while eliminating custom code complexity. The phased migration ensures minimal disruption while delivering immediate benefits through configuration-driven routing and semantic caching.