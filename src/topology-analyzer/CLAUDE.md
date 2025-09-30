# Topology Analyzer Package - Claude Context

## Package Overview
Statistical analysis and topology discovery for telemetry data with real-time service dependency mapping.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no `createTopologyAnalyzerClient` functions)
- **HTTP routers MUST be exported as Effect Layers** (use RouterTag pattern)
- External packages must use TopologyAnalyzerLive Layer or create their own mock
- All async operations use Effect-TS with proper error handling
- Schema validation required for all telemetry inputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Router endpoints delegate to services, avoid business logic in routes
- All analysis is statistical - no LLM/AI calls

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
export interface TopologyAnalyzerService extends Context.Tag<"TopologyAnalyzerService", {
  readonly analyzeArchitecture: (request: AnalysisRequest) => Effect.Effect<AnalysisResult, AnalysisError, never>
  readonly getServiceTopology: (request: TopologyRequest) => Effect.Effect<ReadonlyArray<ServiceTopology>, AnalysisError, never>
}>{}
```

### HTTP Router Pattern
```typescript
// CRITICAL: Export routers as Effect Layers only
export interface TopologyAnalyzerRouter {
  readonly router: express.Router
}

export const TopologyAnalyzerRouterTag = Context.GenericTag<TopologyAnalyzerRouter>('TopologyAnalyzerRouter')

export const TopologyAnalyzerRouterLive = Layer.effect(
  TopologyAnalyzerRouterTag,
  Effect.gen(function* () {
    const topologyAnalyzer = yield* TopologyAnalyzerService
    const storageClient = yield* StorageAPIClientTag

    const router = express.Router()

    // API endpoints
    router.post('/api/topology/analyze', async (req, res) => {
      // Delegate to service, no business logic here
      const result = await Effect.runPromise(
        topologyAnalyzer.analyzeArchitecture(analysisRequest)
      )
      res.json(result)
    })

    return TopologyAnalyzerRouterTag.of({ router })
  })
)
```

### Statistical Analysis Pattern
```typescript
// Generate insights from statistical thresholds
const generateInsights = (topology: ServiceTopology[]): Insight[] => {
  const insights: Insight[] = []

  for (const service of topology) {
    // High latency detection (statistical)
    if (service.metadata.p95LatencyMs && service.metadata.p95LatencyMs > 1000) {
      insights.push({
        type: 'performance',
        severity: 'high',
        title: `High latency in ${service.service}`,
        description: `P95 latency: ${service.metadata.p95LatencyMs}ms`,
        recommendation: 'Investigate slow queries or external dependencies'
      })
    }

    // Error rate detection (statistical)
    if (service.metadata.errorRate && service.metadata.errorRate > 0.05) {
      insights.push({
        type: 'reliability',
        severity: 'critical',
        title: `High error rate in ${service.service}`,
        description: `Error rate: ${(service.metadata.errorRate * 100).toFixed(2)}%`
      })
    }
  }

  return insights
}
```

## Known Issues & Workarounds

### API Path Changes
- **Breaking Change**: Routes changed from `/api/ai-analyzer/*` to `/api/topology/*`
- **Migration**: Update all client code to use new paths
- **Router**: `TopologyAnalyzerRouterLive` handles new paths

### LLM Code Removed
- **Status**: All LLM/AI integration code has been removed
- **Rationale**: Package now focuses purely on statistical analysis
- **Future**: LLM features may be added to a separate ai-insights package

## Common Pitfalls

❌ **DON'T**: Add LLM calls to this package
❌ **DON'T**: Use hardcoded thresholds - make them configurable
❌ **DON'T**: Block during topology queries - use Effect concurrency
❌ **DON'T**: Mix business logic into router handlers
❌ **DON'T**: Use old AIAnalyzer* naming - all renamed to TopologyAnalyzer*

✅ **DO**: Keep analysis purely statistical
✅ **DO**: Use dynamic thresholds based on percentiles
✅ **DO**: Stream data in batches for large topologies
✅ **DO**: Delegate all logic to service layer
✅ **DO**: Use TopologyAnalyzer* naming consistently

## Quick Command Reference

```bash
# Development
pnpm dev:topology-analyzer

# Testing
pnpm test -- src/topology-analyzer/test/unit
pnpm test:integration -- src/topology-analyzer/test/integration

# Type checking
pnpm typecheck

# Find active work
mcp__github__search_issues query:"package:topology-analyzer is:open"
```

## Dependencies & References
- `effect` ^3.11.0
- `@effect/schema` ^0.78.0
- `express` ^4.21.2
- Storage package (for telemetry data queries)
- Full documentation: See README.md

## Recent Refactoring (2025-09-30)

### Renamed from ai-analyzer to topology-analyzer
- Package directory: `src/ai-analyzer/` → `src/topology-analyzer/`
- All symbols: `AIAnalyzer*` → `TopologyAnalyzer*`
- API routes: `/api/ai-analyzer/*` → `/api/topology/*`
- Removed: 800+ lines of unused LLM integration code
- Removed: prompts.ts, model selection logic, fake LLM insights
- Focus: Pure statistical analysis and topology discovery

### Breaking Changes
- All exports renamed (AIAnalyzer → TopologyAnalyzer)
- API client paths changed
- Service interface simplified (removed LLM methods)
- Metadata fields removed: llmModel, llmTokensUsed, selectedModel
