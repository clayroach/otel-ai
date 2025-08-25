# ADR-007: MCP Server Architecture for AIOps Integration

## Status

Proposed

## Context

The project needs to provide LLM-friendly interfaces for querying observability data and integrating with external AIOps platforms. Model Context Protocol (MCP) servers offer a standardized way to connect LLMs with data sources, similar to AWS CloudWatch MCP servers but designed for multi-backend observability integration.

Traditional observability platforms require learning specific query languages and interfaces. MCP servers enable natural language interactions with telemetry data and provide seamless integration pathways to existing enterprise observability solutions like Dynatrace, New Relic, AppDynamics, and Splunk.

## Decision

Plan **MCP Server Architecture** as a **future separate project** ("Telemetry MCP Services") that will provide standardized LLM interfaces for observability data. **Phase 1** focuses on our own platform's telemetry data and AI capabilities, with **Phase 2** being a standalone MCP project that integrates with our platform and others.

## Phased Architecture Overview

### Phase 1: Internal Platform Focus (Days 10-30)

**Scope**: Focus exclusively on our own ClickHouse telemetry data and AI capabilities

#### Internal Natural Language Interface
```typescript
interface OtelAIPlatformQuery {
  // Our platform's topology and relationship queries
  getServiceTopology(timeRange?: TimeRange): Promise<ServiceGraph>
  getServiceDependencies(serviceName: string): Promise<DependencyGraph>
  getTraceFlow(traceId: string): Promise<TraceVisualization>
  
  // Our AI analyzer integration
  detectAnomalies(services: string[], timeRange: TimeRange): Promise<AnomalyReport>
  generateInsights(query: string): Promise<AIInsights>
  recommendActions(anomalies: AnomalyReport): Promise<ActionRecommendations>
  
  // Our platform performance and cost analysis
  analyzeServicePerformance(serviceName: string): Promise<PerformanceReport>
  calculateCosts(timeRange: TimeRange): Promise<CostBreakdown>
  optimizationSuggestions(context: string): Promise<OptimizationPlan>
}
```

**Benefits for Phase 1**:
- **Focused development**: Perfect our own data analysis and AI capabilities first
- **Proven value proposition**: Demonstrate AI-native observability with our own stack
- **Foundation building**: Create solid patterns that can be MCP-ified later

### Phase 2: Separate MCP Project (Post-30-Day Challenge)

**Scope**: Standalone "Telemetry MCP Services" project for broader ecosystem

#### Telemetry MCP Services Project Structure
```
telemetry-mcp-services/
├── packages/
│   ├── otel-ai-mcp/           # Our platform MCP server
│   ├── dynatrace-mcp/         # Dynatrace integration
│   ├── newrelic-mcp/          # New Relic integration  
│   ├── splunk-mcp/            # Splunk integration
│   └── federation-mcp/        # Multi-platform correlation
├── shared/
│   ├── observability-schemas/ # Common telemetry schemas
│   └── ai-analysis-tools/     # Shared AI analysis patterns
└── examples/
    └── claude-code-integration/ # How to use with Claude Code
```

#### Primary Platform MCP Server
```typescript
interface OtelAIMCPServer {
  // Topology and relationship queries
  getServiceTopology(timeRange?: TimeRange): Promise<ServiceGraph>
  getServiceDependencies(serviceName: string): Promise<DependencyGraph>
  getTraceFlow(traceId: string): Promise<TraceVisualization>
  
  // Anomaly detection and AI insights
  detectAnomalies(services: string[], timeRange: TimeRange): Promise<AnomalyReport>
  generateInsights(query: string): Promise<AIInsights>
  recommendActions(anomalies: AnomalyReport): Promise<ActionRecommendations>
  
  // Performance and cost analysis
  analyzeServicePerformance(serviceName: string): Promise<PerformanceReport>
  calculateCosts(timeRange: TimeRange): Promise<CostBreakdown>
  optimizationSuggestions(context: string): Promise<OptimizationPlan>
}
```

#### External Platform Integration MCP Servers
```typescript
// Dynatrace MCP Server
interface DynatraceMCPServer {
  queryMetrics(query: string): Promise<DynatraceMetrics>
  getProblems(timeRange: TimeRange): Promise<DynatraceProblem[]>
  correlateWithPlatform(traceId: string): Promise<CorrelationResult>
}

// New Relic MCP Server  
interface NewRelicMCPServer {
  nrql(query: string): Promise<NewRelicData>
  getAlerts(severity?: string): Promise<NewRelicAlert[]>
  crossPlatformAnalysis(context: PlatformContext): Promise<AnalysisResult>
}

// Splunk MCP Server
interface SplunkMCPServer {
  search(spl: string): Promise<SplunkResults>
  getIndexes(): Promise<string[]>
  federateData(query: FederatedQuery): Promise<UnifiedResults>
}
```

### MCP Server Implementation Pattern

#### Server Foundation
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export class OtelAIMCPServer {
  private server: Server
  private storage: StorageService
  private aiAnalyzer: AIAnalyzerService
  private llmManager: LLMManagerService

  constructor(services: {
    storage: StorageService
    aiAnalyzer: AIAnalyzerService  
    llmManager: LLMManagerService
  }) {
    this.server = new Server({
      name: 'otel-ai-observability',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    })
    
    this.setupTools()
    this.setupResources()
    this.setupPrompts()
  }

  private setupTools(): void {
    // Service topology queries
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_service_topology',
          description: 'Retrieve service dependency graph and topology',
          inputSchema: {
            type: 'object',
            properties: {
              timeRange: { type: 'string', description: 'Time range (e.g., "1h", "24h")' },
              services: { type: 'array', items: { type: 'string' }, description: 'Filter by services' }
            }
          }
        },
        {
          name: 'detect_anomalies', 
          description: 'AI-powered anomaly detection across services',
          inputSchema: {
            type: 'object',
            properties: {
              services: { type: 'array', items: { type: 'string' } },
              timeRange: { type: 'string' },
              sensitivity: { type: 'string', enum: ['low', 'medium', 'high'] }
            }
          }
        },
        {
          name: 'generate_insights',
          description: 'Generate AI insights from natural language query',
          inputSchema: {
            type: 'object', 
            properties: {
              query: { type: 'string', description: 'Natural language query about system behavior' },
              context: { type: 'string', description: 'Additional context (trace IDs, service names, etc.)' }
            }
          }
        }
      ]
    }))
  }
}
```

### Integration Patterns

#### Multi-Backend Federation
```typescript
interface FederatedQuery {
  platforms: ('otel-ai' | 'dynatrace' | 'newrelic' | 'splunk' | 'appdynamics')[]
  query: string
  timeRange: TimeRange
  correlationKeys?: string[]
}

export class MCPFederationService {
  async federateQuery(query: FederatedQuery): Promise<UnifiedResponse> {
    const results = await Promise.all(
      query.platforms.map(platform => this.queryPlatform(platform, query))
    )
    
    return this.correlateResults(results, query.correlationKeys)
  }
  
  private async correlateResults(
    results: PlatformResult[], 
    correlationKeys?: string[]
  ): Promise<UnifiedResponse> {
    // AI-powered correlation across platforms
    // Use trace IDs, service names, timestamps for correlation
    // Generate unified insights and recommendations
  }
}
```

#### Natural Language Interface
```typescript
export class NaturalLanguageProcessor {
  async processQuery(query: string, context?: ObservabilityContext): Promise<MCPResponse> {
    // Parse natural language intent
    const intent = await this.parseIntent(query)
    
    switch (intent.type) {
      case 'topology':
        return this.handleTopologyQuery(intent, context)
      case 'performance':  
        return this.handlePerformanceQuery(intent, context)
      case 'anomaly':
        return this.handleAnomalyQuery(intent, context)
      case 'cost':
        return this.handleCostQuery(intent, context)
      case 'recommendation':
        return this.handleRecommendationQuery(intent, context)
    }
  }
  
  private async parseIntent(query: string): Promise<QueryIntent> {
    // Use LLM Manager to parse natural language
    // Extract entities: services, time ranges, metrics
    // Classify query type and extract parameters
  }
}
```

## Use Cases and Benefits

### For End Users
- **Natural language queries**: "Show me services with high latency in the last hour"
- **Cross-platform correlation**: "Compare this trace in our platform with Dynatrace data"
- **AI-powered insights**: "What's causing the performance degradation in checkout service?"
- **Automated recommendations**: "Suggest optimizations for reducing database query time"

### For Enterprise Integration
- **Unified observability**: Single interface across multiple monitoring platforms
- **Gradual migration**: Compare data between legacy and new platforms
- **Cost optimization**: Analyze costs across multiple observability solutions
- **Knowledge transfer**: AI explanations help teams understand complex systems

### Example MCP Interactions

#### Service Topology Query
```bash
# LLM prompt using MCP server
"Can you show me the service dependencies for the checkout flow and identify any bottlenecks?"

# MCP server response includes:
# - Service dependency graph
# - Performance metrics for each service
# - Identified bottlenecks with AI analysis
# - Recommended actions for optimization
```

#### Cross-Platform Correlation
```bash
# LLM prompt for multi-platform analysis
"This trace ID shows errors in our platform. What does Dynatrace say about the same timeframe?"

# MCP federation response:
# - Trace data from our platform
# - Correlated Dynatrace problems/metrics
# - AI-powered root cause analysis
# - Unified recommendations across platforms
```

## Technical Implementation

### MCP Server Deployment
```yaml
# Docker container for MCP servers
services:
  otel-ai-mcp:
    build: ./mcp-servers/otel-ai
    environment:
      - CLICKHOUSE_URL=${CLICKHOUSE_URL}
      - AI_ANALYZER_URL=${AI_ANALYZER_URL}
      - LLM_MANAGER_URL=${LLM_MANAGER_URL}
    volumes:
      - ./mcp-config:/config
      
  dynatrace-mcp:
    build: ./mcp-servers/dynatrace
    environment:
      - DYNATRACE_API_TOKEN=${DYNATRACE_TOKEN}
      - DYNATRACE_ENVIRONMENT=${DYNATRACE_ENV}
      
  newrelic-mcp:
    build: ./mcp-servers/newrelic  
    environment:
      - NEW_RELIC_API_KEY=${NEW_RELIC_KEY}
      - NEW_RELIC_ACCOUNT_ID=${NEW_RELIC_ACCOUNT}
```

### LLM Integration
```typescript
// Claude Code integration with MCP servers
export class MCPIntegratedLLM {
  constructor(
    private mcpServers: MCPServer[],
    private llmManager: LLMManagerService
  ) {}

  async processObservabilityQuery(query: string): Promise<EnrichedResponse> {
    // Route query to appropriate MCP servers
    const mcpResults = await Promise.all(
      this.mcpServers.map(server => server.query(query))
    )
    
    // Use LLM to synthesize results
    const synthesis = await this.llmManager.synthesize({
      query,
      data: mcpResults,
      context: 'observability-analysis'
    })
    
    return {
      directAnswer: synthesis.answer,
      supportingData: mcpResults,
      recommendations: synthesis.recommendations,
      followUpQuestions: synthesis.followUp
    }
  }
}
```

## Integration with Existing Architecture

### Storage Layer Integration
- **MCP servers query ClickHouse** through existing storage service
- **Unified schema** enables consistent responses across MCP tools
- **Real-time data access** for current system state queries

### AI Analyzer Integration  
- **MCP servers trigger AI analysis** for anomaly detection
- **Results formatted** for LLM consumption and human readability
- **Confidence scoring** helps LLMs qualify recommendations

### LLM Manager Integration
- **MCP responses enhanced** by multi-model LLM analysis
- **Natural language generation** for human-friendly explanations
- **Context-aware routing** to most appropriate LLM model

## Benefits for AIOps Evolution

### Immediate Value
- **Standardized AI interfaces** for observability data
- **Multi-platform integration** without vendor lock-in
- **Natural language accessibility** for non-expert users

### Strategic Advantages
- **Future-proof architecture** as MCP ecosystem grows
- **Competitive differentiation** through AI-first observability
- **Platform-agnostic approach** increases market addressability

### Market Positioning
- **Enterprise-ready** integration capabilities
- **Cost-effective migration** path from legacy platforms
- **AI-native approach** differentiates from traditional solutions

## Success Metrics

1. **Query Success Rate**: >95% of natural language queries return actionable results
2. **Cross-Platform Accuracy**: >90% correlation accuracy across federated platforms  
3. **Response Time**: <2 seconds for simple queries, <10 seconds for complex federation
4. **User Adoption**: MCP interfaces become primary way users interact with platform
5. **Integration Coverage**: Support for top 5 enterprise observability platforms

## Implementation Strategy

### Phase 1: 30-Day Challenge Focus (Days 10-30)

**Primary Goal**: Perfect AI-native observability with our own telemetry data

#### Internal Development Priorities
1. **Natural Language Query Interface** (Days 15-18)
   - Integrate with existing LLM Manager for query processing
   - Use existing AI Analyzer for anomaly detection and insights
   - Query our ClickHouse storage directly with intelligent analysis

2. **AI-Powered Topology Generation** (Days 19-21)
   - Service dependency mapping from our trace data
   - Real-time topology visualization with anomaly highlighting
   - Performance bottleneck identification across service graphs

3. **Intelligent Cost Analysis** (Days 22-24)
   - Cost attribution using API key headers (existing ADR-005)
   - LLM usage tracking and optimization recommendations
   - Infrastructure cost analysis with ClickHouse/S3 usage patterns

**Phase 1 Success Metrics**:
- Natural language queries work seamlessly with our data
- AI-powered insights provide actionable recommendations
- Cost analysis demonstrates platform value and efficiency
- Foundation is solid for future MCP expansion

### Phase 2: Telemetry MCP Services Project (Post-30-Day)

**Separate Project Goals**: Create industry-standard MCP ecosystem

#### Project Positioning
- **Standalone GitHub repository**: `telemetry-mcp-services` 
- **Open source**: Encourage community adoption and contribution
- **Plugin architecture**: Easy integration with any observability platform
- **Our platform as reference**: Showcase AI-native capabilities as the gold standard

#### Market Strategy
- **Demonstrate our platform superiority**: MCP servers show how much better AI-native is
- **Community building**: Attract developers working with traditional platforms
- **Partnership opportunities**: Integrate with existing enterprise observability stacks
- **Competitive advantage**: Position as the AI-first solution in a traditional market

## Strategic Benefits of Phased Approach

### Phase 1 Advantages
- **Focus and momentum**: 30-day challenge stays on target with core value
- **Proven capabilities**: Perfect our AI analysis before building external integrations
- **Market positioning**: Demonstrate clear superiority of AI-native approach
- **Technical foundation**: Build solid patterns that scale to MCP architecture

### Phase 2 Strategic Value
- **Market expansion**: Reach enterprises locked into existing platforms
- **Developer adoption**: Provide migration path from traditional to AI-native observability
- **Ecosystem leadership**: Set standards for LLM-observability integration
- **Revenue opportunities**: Consulting, support, and premium features for enterprise MCP adoption

This phased approach ensures the 30-day challenge delivers a complete, valuable AI-native observability platform while setting the foundation for broader market penetration through the future Telemetry MCP Services ecosystem project.