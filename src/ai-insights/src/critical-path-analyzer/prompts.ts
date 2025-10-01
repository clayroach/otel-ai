/**
 * LLM Prompts for Critical Path Identification
 *
 * Optimized prompts for identifying business-critical request paths
 * from service topology data.
 */

import { ServiceMetrics } from '../types.js'

/**
 * Generate critical path identification prompt
 *
 * This prompt is designed to:
 * 1. Prevent tunnel vision by requiring diverse paths
 * 2. Focus on business impact, not just technical metrics
 * 3. Ensure paths represent distinct capabilities
 * 4. Guide LLM to identify 5-10 critical paths
 */
export const CRITICAL_PATH_IDENTIFICATION_PROMPT = (
  topology: ReadonlyArray<ServiceMetrics>
): string => {
  // Simplify topology for token efficiency (90% reduction)
  const simplifiedTopology = topology.map((service) => ({
    name: service.serviceName,
    calls: service.callCount,
    errors: service.errorRate,
    latency: service.avgLatency,
    deps: service.dependencies.map((d) => d.targetService)
  }))

  return `
You are an expert SRE analyzing a distributed system's service topology to identify critical request paths.

# Service Topology
${JSON.stringify(simplifiedTopology, null, 2)}

# Task
Identify the 5-10 most critical request paths through this system. Each path should:
1. Represent a distinct business capability (e.g., "User Checkout", "Search Results", "Order Processing")
2. Flow from user-facing services to backend/data services
3. Have different characteristics (high traffic, error-prone, latency-sensitive, etc.)
4. Be actionable for diagnostics and monitoring

# Critical Instructions
- **Diverse Paths**: Don't just identify variations of the same flow - find truly different business capabilities
- **Business Names**: Use clear, business-oriented names (NOT technical like "frontend-api-db")
- **End-to-End**: Each path should show the complete request flow from entry to exit
- **Realistic**: Base paths on actual service dependencies in the topology
- **Prioritization**: Assign priority based on business impact + technical severity

# Priority Levels
- **critical**: Revenue-impacting, customer-facing, high volume
- **high**: Important features, moderate volume, business-critical
- **medium**: Supporting features, internal services
- **low**: Background jobs, administrative functions

# Severity Scoring (0-1)
Calculate severity based on:
- Traffic volume (higher = more severe)
- Error rate (higher = more severe)
- Latency (higher = more severe)
- Business impact (customer-facing = more severe)

# Output Format
Return a JSON object with a "paths" array. Each path must have:
{
  "paths": [
    {
      "name": "User Checkout Flow",
      "description": "Complete purchase transaction from cart to payment confirmation",
      "services": ["frontend", "api-gateway", "cart-service", "payment-service", "order-service", "database"],
      "priority": "critical",
      "severity": 0.95
    },
    {
      "name": "Product Search",
      "description": "Search product catalog and return filtered results",
      "services": ["frontend", "api-gateway", "search-service", "catalog-service", "elasticsearch"],
      "priority": "high",
      "severity": 0.75
    }
  ]
}

# Important
- Return ONLY valid JSON, no explanations
- Include exactly 5-10 paths
- Ensure all services in paths exist in the topology
- Make paths distinct from each other
- Focus on observable, diagnosable flows
`.trim()
}

/**
 * Alternative prompt for when topology is too complex
 * Uses more aggressive simplification
 */
export const CRITICAL_PATH_IDENTIFICATION_PROMPT_SIMPLIFIED = (
  topology: ReadonlyArray<ServiceMetrics>
): string => {
  // Extract only the most critical services (top 20 by call count)
  const topServices = [...topology]
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 20)
    .map((s) => ({
      name: s.serviceName,
      calls: s.callCount,
      errors: s.errorRate,
      to: s.dependencies.map((d) => d.targetService).join(',')
    }))

  return `
Analyze this distributed system and identify 5-7 critical request paths.

Services (top 20 by volume):
${JSON.stringify(topServices, null, 2)}

Return JSON:
{
  "paths": [
    {
      "name": "Business Capability Name",
      "description": "What this path does",
      "services": ["service1", "service2", "service3"],
      "priority": "critical|high|medium|low",
      "severity": 0.0-1.0
    }
  ]
}

Requirements:
- 5-7 distinct paths
- Business-oriented names
- Real services from topology
- End-to-end flows
- Diverse priorities
`.trim()
}
