# ADR-005: API Key Trace Header Strategy

## Status

Proposed

## Context

To enable automatic LLM API calls on a per-trace basis and provide cost attribution, we need a strategy for including API keys in trace headers. This will allow the platform to automatically call OpenAI, Claude, and Gemini APIs for analysis.

## Decision

Implement **API key inclusion in trace headers** with automatic extraction and cost attribution for LLM API usage.

## Header Strategy

### Trace Header Format
```
X-API-Key-OpenAI: sk-...
X-API-Key-Claude: sk-ant-...
X-API-Key-Gemini: AIzaSy...
X-User-ID: user-123
X-Organization-ID: org-456
```

### Security Considerations
- **Headers are optional** - traces work without API keys
- **API keys are encrypted** in storage using platform key
- **Access control** - only authorized components can decrypt
- **Audit logging** for all API key usage

## Implementation Approach

### Phase 1: Header Extraction
```typescript
interface TraceAPIKeys {
  openai?: string
  claude?: string  
  gemini?: string
  user_id?: string
  organization_id?: string
}

export class APIKeyExtractor {
  extractFromHeaders(headers: Record<string, string>): TraceAPIKeys
  encryptForStorage(keys: TraceAPIKeys): string
  decryptFromStorage(encrypted: string): TraceAPIKeys
}
```

### Phase 2: Automatic LLM Routing
- **Trace analysis** automatically uses available API keys
- **Cost attribution** to specific users/organizations
- **Smart routing** based on available credits/models
- **Fallback strategy** when API keys unavailable

### Phase 3: Cost Attribution
- **Per-trace cost calculation** using actual API keys
- **User/organization billing** integration
- **Real-time cost alerts** for budget management
- **Cost optimization** recommendations

## Use Cases

### Automatic Trace Analysis
```typescript
// When trace arrives with API keys
async function analyzeTrace(trace: TraceData): Promise<TraceInsights> {
  const apiKeys = extractAPIKeys(trace.headers)
  
  if (apiKeys.openai) {
    const insights = await openaiAnalyzer.analyze(trace, apiKeys.openai)
    await costTracker.record('openai', insights.cost, trace.id)
    return insights
  }
  
  // Fallback to platform API keys or skip analysis
  return basicAnalysis(trace)
}
```

### User-Specific Features
- **Custom dashboards** generated using user's preferred LLM
- **Personalized alerts** based on user's API quotas
- **Organization-level** cost controls and reporting

## Security Implementation

### Encryption Strategy
- **Platform master key** for encrypting API keys
- **Key rotation** capabilities for security
- **Secure key storage** using environment variables
- **No plain-text API keys** in logs or database

### Access Control
- **Role-based access** to encrypted API keys
- **Audit trail** for all API key usage
- **Rate limiting** to prevent abuse
- **Automatic key validation** before storage

## Integration Points

### OpenTelemetry Collector
- **Header preservation** through collection pipeline
- **Metadata extraction** for API keys
- **Secure transmission** to backend storage

### ClickHouse Storage
- **Encrypted column** for API key data
- **Indexed by user_id** for fast lookup
- **TTL policies** for automatic key expiration

### Frontend Integration
- **Optional API key input** in trace submission
- **Cost dashboard** showing user-specific usage
- **API key management** interface

## Benefits

### User Experience
- **Personalized analysis** using user's preferred AI models
- **Transparent costs** with real-time tracking
- **No platform API limits** affecting user experience

### Platform Benefits
- **Cost attribution** eliminates platform API costs
- **Scalable AI features** without platform funding limits
- **User investment** in platform through their own API usage

### Analytics Capabilities
- **Multi-model comparison** using different APIs per trace
- **Cost-effectiveness analysis** across AI providers
- **User behavior insights** based on API preferences

## Risk Mitigation

### API Key Security
- **Encryption at rest** and in transit
- **Limited scope** API keys when possible
- **Regular key rotation** recommendations
- **Secure deletion** when users leave

### Cost Control
- **Budget alerts** before API limits
- **Usage caps** per user/organization
- **Cost estimation** before expensive operations
- **Fallback strategies** when budgets exceeded

## Success Metrics

- **API key adoption rate** among users
- **Cost attribution accuracy** (100% of LLM usage tracked)
- **Security incidents** (target: zero API key compromises)
- **User satisfaction** with personalized AI features