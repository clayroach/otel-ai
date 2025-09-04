# ADR-014: LLM Management Library Evaluation and Hardcoded Model Reference Refactoring

## Status
Proposed

## Context

The custom LLM Manager in `clayroach/otel-ai` has revealed significant complexity and architectural issues during implementation:

### Current Architecture Problems
1. **Hardcoded Model References**: Throughout the codebase, we use hardcoded string literals `'gpt'`, `'claude'`, `'llama'` instead of actual model names
2. **Complex Custom Routing**: Manual model selection logic with custom error handling and fallback strategies
3. **Configuration Duplication**: Multiple environment variable loading functions (`config.ts`, `llm-manager-live.ts`) with inconsistent behavior
4. **Client Management Overhead**: Manual client instantiation, health checking, and performance tracking
5. **Testing Complexity**: Extensive mocking required for multi-model scenarios
6. **Runtime vs Test Environment Divergence**: Tests pass but UI still shows fallback queries instead of LLM-generated ones

### Key Architectural Insight
Building our own LLM management layer doesn't make sense when specialized libraries exist that provide battle-tested solutions for multi-model orchestration, routing, and resilience.

## Decision

**Phase 1**: Refactor to eliminate hardcoded model references and fix immediate runtime issues
**Phase 2**: Evaluate and implement a specialized LLM management library to replace custom implementation

## Library Evaluation

Based on comprehensive research, we evaluated four primary options:

### 1. LangChain.js - Multi-Model Prompt Routing and Tool Selection

**Capabilities:**
- **Prompt/Chain Routing**: `MultiRouteChain` can use one model to classify queries and route to specialized chains
- **Agent Tool Selection**: ReAct agents can reason about tasks and choose appropriate tools/models dynamically
- **Multiple Model Orchestration**: Dynamic model selection at runtime based on context and cost optimization
- **Error Handling & Fallback**: Retry utilities and fallback chains for failed model calls

**Pros:**
- Well-supported library with extensive provider integration
- Covers prompt engineering, chaining, and tool integration
- Agent API handles tool selection and reasoning automatically
- Rich ecosystem and documentation

**Cons:**
- Heavy framework with many dependencies
- Opinionated architecture may conflict with Effect-TS patterns
- Performance overhead for simple model routing use cases
- Complex for our specific multi-model routing needs

### 2. LlamaIndex TS - Agentic Workflows and Data Integration

**Capabilities:**
- **Agent Framework**: Multi-step reasoning with tool and model selection
- **Data Integration**: Native support for vector databases, indices, and API tools
- **Multiple Providers**: Support for OpenAI, Anthropic, local models via wrappers
- **Chain of Thought**: Built-in planning loops for complex reasoning tasks

**Pros:**
- Higher-level workflow for LLM applications with data integration
- Designed for agentic RAG scenarios (matches our observability use case)
- TypeScript-first with Next.js/Node.js optimization
- Handles combining LLM calls with data lookups naturally

**Cons:**
- More focused on data integration than pure model routing
- May be overkill for our current SQL generation use case
- Less mature ecosystem compared to LangChain

### 3. OpenRouter - Unified Multi-Provider API with Fallbacks

**Capabilities:**
- **Single API**: Access to all major models through one OpenAI-compatible endpoint
- **Automatic Model Selection**: `openrouter/auto` uses AI classifier (NotDiamond) for prompt-based routing
- **Provider Failover**: Native support for fallover ordering with automatic retry
- **Unified Monitoring**: Centralized usage tracking and cost optimization

**Pros:**
- Eliminates need for custom client implementations
- Automatic failover and intelligent routing out-of-the-box
- OpenAI-compatible API (drop-in replacement)
- Free to use (bring your own API keys)
- Handles provider selection and high availability automatically

**Cons:**
- External service dependency (not self-hosted)
- Limited customization of routing logic
- Network latency for all requests

### 4. Portkey - Open-Source LLM Gateway for Conditional Routing & Resilience

**Capabilities:**
- **Configurable Conditional Routing**: YAML/JSON-defined routing rules based on custom conditions
- **Automatic Retries and Fallbacks**: Built-in strategies with circuit breaker patterns
- **Multi-Model Orchestration**: Access to 1,600+ models via unified REST API
- **Semantic Caching**: Cache similar prompts to reduce costs and improve latency
- **OpenTelemetry Integration**: Native observability with traces and metrics

**Pros:**
- Open-source and self-hostable
- Enterprise-grade routing and resilience features
- Excellent observability integration (perfect for our OTel focus)
- Highly configurable without code changes
- Production-ready with comprehensive features

**Cons:**
- Additional infrastructure complexity (gateway deployment)
- Learning curve for configuration management
- Newer project with smaller community

## Recommended Solution

**Two-Phase Approach: Immediate Refactoring + Portkey Integration**

### Phase 1: Hardcoded Reference Elimination (Immediate)
Address the fundamental architectural issue causing runtime failures:

```typescript
// BEFORE: Hardcoded model types
const client = model === 'gpt' ? clients.gpt : clients.claude : clients.llama

// AFTER: Actual model name routing
if (model.includes('claude')) {
  client = clients.claude
} else if (model.includes('gpt')) {
  client = clients.gpt
} else {
  // Local models (sqlcoder-7b-2, codellama-7b-instruct, etc.)
  client = clients.llama
}
```

**Tasks:**
1. Remove all hardcoded `'gpt'`, `'claude'`, `'llama'` references across codebase (27+ files)
2. Update router `isModelAvailable()` and client selection to use actual model names
3. Consolidate environment variable loading into single source of truth
4. Fix UI runtime routing to use actual models instead of fallback queries

### Phase 2: Portkey Integration (Strategic)
Replace custom LLM Manager with Portkey for production-grade orchestration:

```yaml
# portkey-config.yaml
targets:
  - name: "sql-models"
    models: ["sqlcoder-7b-2", "codellama-7b-instruct"]
    strategy: "loadbalance"
    
  - name: "general-models" 
    models: ["claude-3-7-sonnet-20250219", "gpt-3.5-turbo"]
    strategy: "fallback"

routes:
  - condition: "prompt.contains('SELECT') || prompt.contains('SQL')"
    target: "sql-models"
  - condition: "default"
    target: "general-models"
```

**Why Portkey?**
1. **Perfect Observability Fit**: Native OpenTelemetry integration aligns with our platform focus
2. **Self-Hosted Control**: Open-source gateway we can deploy and customize
3. **Enterprise Features**: Semantic caching, circuit breakers, advanced routing
4. **Configuration-Driven**: Modify routing without code changes
5. **Cost Optimization**: Built-in usage tracking and caching

## Implementation Plan

### Week 1: Phase 1 - Hardcoded Reference Cleanup
- [ ] Audit all 27+ files with hardcoded `'gpt'`, `'claude'`, `'llama'` references
- [ ] Refactor router `isModelAvailable()` and client selection logic
- [ ] Consolidate environment variable loading (remove duplication between `config.ts` and `llm-manager-live.ts`)
- [ ] Fix UI runtime routing issue causing fallback queries
- [ ] Ensure all tests pass and UI generates actual LLM queries

### Week 2: Phase 2 - Portkey Evaluation
- [ ] Set up Portkey gateway in development environment
- [ ] Create proof-of-concept routing configuration
- [ ] Test integration with existing query generator
- [ ] Benchmark performance vs current implementation
- [ ] Document migration path and configuration

### Week 3: Portkey Integration
- [ ] Replace LLM Manager service with Portkey client
- [ ] Migrate routing logic to Portkey configuration
- [ ] Implement OpenTelemetry tracing integration
- [ ] Add semantic caching for repeated queries
- [ ] Production deployment and monitoring setup

## Success Criteria

### Phase 1 (Immediate)
1. **Runtime Fix**: UI generates actual LLM queries instead of fallback queries
2. **Code Cleanup**: Zero hardcoded `'gpt'`, `'claude'`, `'llama'` references
3. **Configuration Unity**: Single source of truth for environment variables
4. **Test Parity**: All existing tests pass with new model name routing

### Phase 2 (Strategic)
1. **Simplified Codebase**: Remove 70%+ of custom LLM management code
2. **Better Performance**: Reduced latency through caching and optimized routing
3. **Cost Visibility**: Clear usage tracking and optimization
4. **Production Readiness**: Proper observability, retries, and circuit breakers
5. **Developer Experience**: Configuration-driven routing without code changes

## Risks and Mitigations

### Phase 1 Risks
- **Breaking Changes**: Extensive refactoring may introduce regressions
  - *Mitigation*: Comprehensive test coverage and incremental changes
- **Runtime Environment Differences**: Test vs production environment discrepancies
  - *Mitigation*: Validate in actual runtime environment, not just tests

### Phase 2 Risks
- **External Dependency**: Adding Portkey gateway as infrastructure component
  - *Mitigation*: Self-hosted deployment with fallback to direct model calls
- **Configuration Complexity**: YAML/JSON routing rules may become unwieldy
  - *Mitigation*: Start simple, gradually add complexity as needed
- **Performance Overhead**: Gateway may add latency
  - *Mitigation*: Benchmark thoroughly, use local deployment to minimize latency

## Alternative Approaches Considered

1. **OpenRouter**: Excellent for hosted solution but lacks self-hosting control
2. **LangChain.js**: Too heavy for our focused routing needs
3. **LlamaIndex TS**: Better for data-heavy applications than pure routing
4. **Continue Custom Implementation**: Maintains current complexity without benefits of proven solutions

## Conclusion

The two-phase approach addresses both immediate runtime issues and long-term architectural goals:

**Phase 1** eliminates the hardcoded model reference anti-pattern that causes UI fallback issues and creates a foundation for proper model name routing.

**Phase 2** replaces our custom implementation with Portkey's production-grade gateway, providing advanced features like semantic caching, circuit breakers, and native observability integration.

This strategy allows us to quickly fix current issues while moving toward a more maintainable, feature-rich solution that aligns perfectly with our AI-native observability platform goals.

---

**References:**
- [MultiRouteChain | LangChain.js](https://v02.api.js.langchain.com/classes/langchain.chains.MultiRouteChain.html)
- [LlamaIndex.TS - Build LLM-powered document agents](https://ts.llamaindex.ai/)
- [OpenRouter - Dynamic AI Model Selection](https://openrouter.ai/docs/features/model-routing)
- [Portkey: Open-source AI Gateway](https://portkey.ai/docs/product/ai-gateway)

**Next Steps:**
1. Begin Phase 1 hardcoded reference elimination
2. Set up Portkey development environment for Phase 2 evaluation
3. Create migration timeline and rollback strategy