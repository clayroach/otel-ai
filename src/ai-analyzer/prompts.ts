/**
 * LLM Prompt Templates for Architecture Analysis
 * 
 * Specialized prompts for analyzing application architecture from trace data
 * and generating comprehensive documentation and insights.
 */

import type { ApplicationArchitecture, ServiceTopology } from './types.js'

/**
 * Core prompt templates for different analysis types
 */
export const PromptTemplates = {
  
  /**
   * Generate application architecture overview
   */
  architectureOverview: (architecture: ApplicationArchitecture) => `
You are an expert software architect analyzing a distributed application based on its OpenTelemetry trace data. 

## Application Data
**Application Name:** ${architecture.applicationName}
**Services Count:** ${architecture.services.length}
**Data Flows:** ${architecture.dataFlows.length}
**Analysis Date:** ${architecture.generatedAt.toISOString()}

## Services Discovered
${architecture.services.map(service => `
**${service.service}** (${service.type})
- Operations: ${service.operations.join(', ')}
- Dependencies: ${service.dependencies.length} services
- Error Rate: ${((service.metadata.errorRate as number) * 100).toFixed(2)}%
- Avg Latency: ${(service.metadata.avgLatencyMs as number).toFixed(0)}ms
- Total Spans: ${service.metadata.totalSpans}
`).join('\n')}

## Data Flows
${architecture.dataFlows.slice(0, 10).map(flow => `
- ${flow.from} → ${flow.to} (${flow.operation})
  Volume: ${flow.volume} calls, Latency: ${flow.latency.p50.toFixed(0)}ms avg
`).join('\n')}

## Critical Paths
${architecture.criticalPaths.slice(0, 5).map(path => `
- **${path.name}**: ${path.avgLatencyMs.toFixed(0)}ms avg, ${(path.errorRate * 100).toFixed(2)}% errors
  Path: ${path.services.join(' → ')}
`).join('\n')}

## Task
Based on this trace data analysis, provide a comprehensive architecture overview including:

1. **Architecture Summary** (2-3 sentences describing the overall application)
2. **Service Classification** (group services by architectural layers/purposes)
3. **Key Data Flows** (describe the main request/data paths)
4. **Architecture Patterns** (identify patterns like microservices, API gateway, etc.)
5. **Performance Insights** (highlight performance characteristics and bottlenecks)
6. **Reliability Assessment** (comment on error rates and system resilience)

Format your response as clear, professional documentation that could be included in an architecture document.
`,

  /**
   * Generate service dependency analysis
   */
  dependencyAnalysis: (architecture: ApplicationArchitecture) => `
You are a system architect analyzing service dependencies in a distributed application.

## Service Dependencies Analysis

${architecture.services.map(service => `
### ${service.service} (${service.type})
**Depends on:**
${service.dependencies.length > 0 ? service.dependencies.map(dep => `
- ${dep.service}.${dep.operation}
  - Calls: ${dep.callCount}
  - Avg Latency: ${dep.avgLatencyMs.toFixed(0)}ms
  - Error Rate: ${(dep.errorRate * 100).toFixed(2)}%
`).join('') : '  - No dependencies (leaf service)'}

**Service Metrics:**
- Total Operations: ${service.operations.length}
- Error Rate: ${((service.metadata.errorRate as number) * 100).toFixed(2)}%
- Performance: ${(service.metadata.avgLatencyMs as number).toFixed(0)}ms avg latency
`).join('\n')}

## Task
Analyze these service dependencies and provide:

1. **Dependency Complexity Assessment** - Which services have the most complex dependency graphs?
2. **Critical Dependencies** - Identify services that many others depend on
3. **Potential Single Points of Failure** - Services whose failure would cascade
4. **Optimization Opportunities** - Suggest dependency simplifications
5. **Risk Assessment** - Services with high error rates affecting others

Focus on practical architectural insights that could guide refactoring or reliability improvements.
`,

  /**
   * Generate performance insights
   */
  performanceInsights: (architecture: ApplicationArchitecture) => `
You are a performance engineer analyzing application performance from distributed tracing data.

## Performance Data Summary

### Critical Paths (Highest Latency)
${architecture.criticalPaths.slice(0, 5).map(path => `
**${path.name}**
- Average Latency: ${path.avgLatencyMs.toFixed(0)}ms
- Error Rate: ${(path.errorRate * 100).toFixed(2)}%
- Services: ${path.services.join(' → ')}
`).join('\n')}

### Service Performance Profiles
${architecture.services
  .sort((a, b) => (b.metadata.avgLatencyMs as number) - (a.metadata.avgLatencyMs as number))
  .slice(0, 10)
  .map(service => `
**${service.service}** (${service.type})
- Avg Latency: ${(service.metadata.avgLatencyMs as number).toFixed(0)}ms
- P95 Latency: ${(service.metadata.p95LatencyMs as number).toFixed(0)}ms  
- Error Rate: ${((service.metadata.errorRate as number) * 100).toFixed(2)}%
- Volume: ${service.metadata.totalSpans} spans analyzed
`).join('\n')}

### High-Volume Data Flows
${architecture.dataFlows
  .sort((a, b) => b.volume - a.volume)
  .slice(0, 10)
  .map(flow => `
**${flow.from} → ${flow.to}**
- Volume: ${flow.volume} calls
- Latency: P50=${flow.latency.p50.toFixed(0)}ms, P95=${flow.latency.p95.toFixed(0)}ms, P99=${flow.latency.p99.toFixed(0)}ms
- Operation: ${flow.operation}
`).join('\n')}

## Task
Provide a performance analysis including:

1. **Performance Bottlenecks** - Identify the slowest services and operations
2. **Scalability Concerns** - Services with high latency or error rates under load
3. **Optimization Recommendations** - Specific suggestions for improving performance
4. **Monitoring Priorities** - Which services/paths need the most attention
5. **Capacity Planning** - Insights for scaling decisions

Focus on actionable performance optimization recommendations.
`,

  /**
   * Generate Mermaid diagrams
   */
  mermaidDiagram: (architecture: ApplicationArchitecture, diagramType: 'architecture' | 'sequence' | 'dataflow') => {
    const basePrompt = `
Generate a Mermaid diagram for this application architecture:

## Services:
${architecture.services.map(s => `- ${s.service} (${s.type})`).join('\n')}

## Key Data Flows:
${architecture.dataFlows.slice(0, 15).map(f => `- ${f.from} → ${f.to} (${f.volume} calls)`).join('\n')}
`

    switch (diagramType) {
      case 'architecture':
        return basePrompt + `
## Task
Create a Mermaid **graph** diagram showing the application architecture:
- Use appropriate node shapes for different service types
- Show service dependencies with labeled arrows
- Group related services into subgraphs where logical
- Use colors to differentiate service types

Return ONLY the Mermaid code, starting with \`graph TD\` or \`graph LR\`.
`

      case 'sequence':
        return basePrompt + `
## Critical Path Example:
${architecture.criticalPaths[0] ? `${architecture.criticalPaths[0].services.join(' → ')}` : 'No critical path data'}

## Task  
Create a Mermaid **sequenceDiagram** showing a typical request flow:
- Show the sequence of calls between services
- Include timing information where relevant
- Focus on the most common or critical user journey

Return ONLY the Mermaid code, starting with \`sequenceDiagram\`.
`

      case 'dataflow':
        return basePrompt + `
## Task
Create a Mermaid **flowchart** focused on data flow:
- Show how data moves through the system
- Highlight databases, caches, and external services
- Include volume indicators for high-traffic flows
- Use different node shapes for data stores vs processing services

Return ONLY the Mermaid code, starting with \`flowchart TD\` or \`flowchart LR\`.
`
    }
  },

  /**
   * Generate comprehensive documentation
   */
  generateDocumentation: (architecture: ApplicationArchitecture) => `
You are a technical writer creating comprehensive architecture documentation from distributed tracing analysis.

${PromptTemplates.architectureOverview(architecture)}

## Additional Context
- This documentation will be used by development teams, SREs, and new team members
- Include both high-level overview and technical details
- Focus on practical information for operating and extending the system

## Task
Generate complete architecture documentation in Markdown format including:

### 1. Executive Summary
- Brief overview of the application and its purpose
- Key metrics and scale

### 2. Architecture Overview  
- High-level architecture description
- Service classification and roles
- Key architectural patterns used

### 3. Service Catalog
- Detailed description of each service
- Dependencies and interactions
- Performance characteristics

### 4. Data Flow Analysis
- Major data paths through the system
- Critical request flows
- Integration points

### 5. Performance Profile
- System performance characteristics
- Known bottlenecks and constraints
- Scaling considerations

### 6. Operational Insights
- Reliability assessment
- Monitoring recommendations
- Common failure modes

### 7. Architecture Decisions & Trade-offs
- Notable design decisions evident from the trace data
- Performance vs complexity trade-offs
- Suggestions for improvement

Format as clean Markdown with appropriate headers, lists, and emphasis. Include specific metrics and data from the analysis.
`
}

/**
 * Prompt utilities for dynamic content
 */
export const PromptUtils = {
  
  /**
   * Add service filtering context to prompts
   */
  withServiceFilter: (basePrompt: string, services: string[]) => {
    return basePrompt + `\n\n**Note:** This analysis is filtered to focus on these services: ${services.join(', ')}`
  },

  /**
   * Add time range context to prompts  
   */
  withTimeContext: (basePrompt: string, startTime: Date, endTime: Date) => {
    const duration = endTime.getTime() - startTime.getTime()
    const hours = Math.round(duration / (1000 * 60 * 60))
    return basePrompt + `\n\n**Analysis Time Window:** ${hours} hours (${startTime.toISOString()} to ${endTime.toISOString()})`
  },

  /**
   * Format service metadata for prompts
   */
  formatServiceMetrics: (service: ServiceTopology) => {
    return `
**${service.service}** (${service.type})
- Operations: ${service.operations.join(', ')}
- Dependencies: ${service.dependencies.length}
- Error Rate: ${((service.metadata.errorRate as number) * 100).toFixed(2)}%
- Avg Latency: ${(service.metadata.avgLatencyMs as number).toFixed(0)}ms
- P95 Latency: ${(service.metadata.p95LatencyMs as number).toFixed(0)}ms
- Volume: ${service.metadata.totalSpans} spans
`
  }
}