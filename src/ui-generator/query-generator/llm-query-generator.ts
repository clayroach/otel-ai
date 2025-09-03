import { Effect, pipe } from "effect"
import { CriticalPath, GeneratedQuery, QueryPattern } from "./types"
import { createSimpleLLMManager } from "../../llm-manager/simple-manager"
import { LLMRequest } from "../../llm-manager/types"
import { Schema } from "@effect/schema"

// Schema for LLM-generated query response
const LLMQueryResponseSchema = Schema.Struct({
  sql: Schema.String,
  description: Schema.String,
  expectedColumns: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      description: Schema.String
    })
  ),
  reasoning: Schema.String
})

type LLMQueryResponse = Schema.Schema.Type<typeof LLMQueryResponseSchema>

// Create a dynamic prompt with examples for the LLM
const createDynamicQueryPrompt = (path: CriticalPath, analysisGoal: string): string => {
  const services = path.services.map(s => `'${s.replace(/'/g, "''")}'`).join(", ")
  
  return `
You are a ClickHouse SQL expert generating queries for observability data analysis.

## Database Schema
Table: traces
Columns:
- trace_id (String): Unique trace identifier
- span_id (String): Unique span identifier  
- parent_span_id (String): Parent span ID for trace hierarchy
- service_name (String): Name of the service
- operation_name (String): Name of the operation/endpoint
- start_time (DateTime64): Start timestamp with nanosecond precision
- end_time (DateTime64): End timestamp with nanosecond precision
- duration_ns (UInt64): Duration in nanoseconds
- status_code (String): Status code (OK, ERROR, etc.)
- status_message (String): Status message details
- attributes (Map(String, String)): Additional attributes
- resource_attributes (Map(String, String)): Resource attributes

## Critical Path Context
- Path ID: ${path.id}
- Path Name: ${path.name}
- Services in path: ${path.services.join(" → ")}
- Start Service: ${path.startService}
- End Service: ${path.endService}
- Services to analyze: ${services}

## Example Query Patterns

### Example 1: Latency Analysis
Goal: Analyze p50, p95, p99 latencies across services
\`\`\`sql
SELECT 
  service_name,
  toStartOfMinute(start_time) as minute,
  quantile(0.5)(duration_ns/1000000) as p50_ms,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  quantile(0.99)(duration_ns/1000000) as p99_ms,
  count() as request_count
FROM traces
WHERE 
  service_name IN ('service1', 'service2')
  AND start_time >= now() - INTERVAL 60 MINUTE
GROUP BY service_name, minute
ORDER BY minute DESC, service_name
\`\`\`

### Example 2: Error Pattern Analysis
Goal: Identify error distribution and patterns
\`\`\`sql
SELECT 
  service_name,
  status_code,
  status_message,
  count() as error_count,
  round(count() * 100.0 / sum(count()) OVER (), 2) as error_percentage
FROM traces
WHERE 
  service_name IN ('service1', 'service2')
  AND status_code != 'OK'
  AND start_time >= now() - INTERVAL 60 MINUTE
GROUP BY service_name, status_code, status_message
ORDER BY error_count DESC
\`\`\`

### Example 3: Bottleneck Detection
Goal: Find slowest operations affecting performance
\`\`\`sql
SELECT 
  service_name,
  operation_name,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  max(duration_ns/1000000) as max_ms,
  count() as operation_count
FROM traces
WHERE 
  service_name IN ('service1', 'service2')
  AND start_time >= now() - INTERVAL 60 MINUTE
GROUP BY service_name, operation_name
HAVING p95_ms > 100
ORDER BY p95_ms DESC
\`\`\`

### Example 4: Throughput Analysis
Goal: Measure request rates and success ratios
\`\`\`sql
SELECT 
  service_name,
  toStartOfMinute(start_time) as minute,
  count() as requests_per_minute,
  count() / 60.0 as requests_per_second,
  sum(CASE WHEN status_code = 'OK' THEN 1 ELSE 0 END) as successful,
  round(sum(CASE WHEN status_code = 'OK' THEN 1 ELSE 0 END) * 100.0 / count(), 2) as success_rate
FROM traces
WHERE 
  service_name IN ('service1', 'service2')
  AND start_time >= now() - INTERVAL 60 MINUTE
GROUP BY service_name, minute
ORDER BY minute DESC
\`\`\`

### Example 5: Time Period Comparison
Goal: Compare current vs previous period performance
\`\`\`sql
WITH current_period AS (
  SELECT 
    service_name,
    quantile(0.95)(duration_ns/1000000) as p95_ms,
    count() as request_count
  FROM traces
  WHERE 
    service_name IN ('service1', 'service2')
    AND start_time >= now() - INTERVAL 60 MINUTE
  GROUP BY service_name
),
previous_period AS (
  SELECT 
    service_name,
    quantile(0.95)(duration_ns/1000000) as p95_ms,
    count() as request_count
  FROM traces
  WHERE 
    service_name IN ('service1', 'service2')
    AND start_time >= now() - INTERVAL 120 MINUTE
    AND start_time < now() - INTERVAL 60 MINUTE
  GROUP BY service_name
)
SELECT 
  c.service_name,
  c.p95_ms as current_p95,
  p.p95_ms as previous_p95,
  round((c.p95_ms - p.p95_ms) / p.p95_ms * 100, 2) as p95_change_percent,
  c.request_count as current_requests,
  p.request_count as previous_requests
FROM current_period c
LEFT JOIN previous_period p ON c.service_name = p.service_name
\`\`\`

## Your Task
Generate a ClickHouse query for the following analysis goal:
"${analysisGoal}"

Use the examples above as patterns, but create a query specifically optimized for the given critical path and analysis goal.
Adapt the query structure, aggregations, and filters based on what would be most insightful.

Return a JSON response with:
{
  "sql": "The complete ClickHouse query",
  "description": "Clear description of what this query analyzes",
  "expectedColumns": [
    {"name": "column_name", "type": "ClickHouse type", "description": "What this column represents"}
  ],
  "reasoning": "Why this query structure is optimal for the analysis goal",
  "insights": "What insights this query will provide"
}

Important:
- Use the actual service names: ${services}
- Ensure proper escaping of service names
- Include appropriate time filters
- Choose aggregations that best match the analysis goal
- Be creative but ensure the query is performant
`
}

// Map of analysis goals for different contexts
export const ANALYSIS_GOALS = {
  latency: "Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring",
  errors: "Identify error patterns, distribution, and root causes across services to improve reliability",
  bottlenecks: "Detect performance bottlenecks by finding slowest operations and their impact on the critical path",
  throughput: "Measure request volume, throughput rates, and success ratios to understand system capacity",
  comparison: "Compare current performance metrics with previous time periods to identify trends and regressions",
  custom: (goal: string) => goal
}

// Generate query using LLM with dynamic prompt
export const generateQueryWithLLM = (
  path: CriticalPath,
  analysisGoal: string,
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery, Error, never> => {
  const llmManager = createSimpleLLMManager({
    models: {
      llama: {
        endpoint: llmConfig?.endpoint || "http://localhost:1234/v1",
        modelPath: llmConfig?.model || "local-model",
        contextLength: 4096,
        threads: 4
      }
    }
  })

  const prompt = createDynamicQueryPrompt(path, analysisGoal)
  
  const request: LLMRequest = {
    prompt: `You are a ClickHouse SQL expert. Always return valid JSON responses. Generate consistent, optimal queries based on the examples provided.\n\n${prompt}`,
    taskType: "analysis",
    preferences: {
      model: "llama",
      maxTokens: 2000,
      temperature: 0, // Zero temperature for deterministic output
      requireStructuredOutput: true
    }
  }

  return pipe(
    llmManager.generate(request),
    Effect.map(response => {
      try {
        // Parse the LLM response as JSON
        const parsed = JSON.parse(response.content) as LLMQueryResponse & { insights?: string }
        
        // Validate the generated SQL
        if (!validateGeneratedSQL(parsed.sql)) {
          throw new Error("Generated SQL failed validation - contains forbidden operations or missing required elements")
        }
        
        // Convert to GeneratedQuery format
        const query: GeneratedQuery = {
          id: `${path.id}_${Date.now()}_llm`,
          name: `${analysisGoal.substring(0, 50)} - ${path.name}`,
          description: parsed.description,
          pattern: QueryPattern.SERVICE_LATENCY, // Default pattern, but LLM decides actual query structure
          sql: parsed.sql.trim(),
          expectedSchema: parsed.expectedColumns.reduce((acc, col) => {
            acc[col.name] = col.type
            return acc
          }, {} as Record<string, string>)
        }
        
        return query
      } catch (error) {
        throw new Error(`Failed to parse LLM response: ${error}`)
      }
    }),
    Effect.catchAll((error) => 
      Effect.fail(new Error(`LLM query generation failed: ${error}`))
    )
  )
}

// Generate multiple queries for different analysis goals
export const generateQueriesForGoals = (
  path: CriticalPath,
  analysisGoals: string[],
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery[], Error, never> => {
  return Effect.all(
    analysisGoals.map(goal => generateQueryWithLLM(path, goal, llmConfig)),
    { concurrency: 1 } // Sequential to avoid overwhelming the LLM
  )
}

// Generate standard set of queries
export const generateStandardQueries = (
  path: CriticalPath,
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery[], Error, never> => {
  const standardGoals = [
    ANALYSIS_GOALS.latency,
    ANALYSIS_GOALS.errors,
    ANALYSIS_GOALS.bottlenecks,
    ANALYSIS_GOALS.throughput,
    ANALYSIS_GOALS.comparison
  ]
  
  return generateQueriesForGoals(path, standardGoals, llmConfig)
}

// Validate generated SQL (basic validation)
export const validateGeneratedSQL = (sql: string): boolean => {
  const required = [
    "SELECT",
    "FROM traces",
    "WHERE",
    "service_name"
  ]
  
  const forbidden = [
    "DROP",
    "DELETE",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "INSERT",
    "UPDATE"
  ]
  
  const upperSQL = sql.toUpperCase()
  
  // Check for required elements
  for (const req of required) {
    if (!upperSQL.includes(req.toUpperCase())) {
      return false
    }
  }
  
  // Check for forbidden operations
  for (const forbid of forbidden) {
    if (upperSQL.includes(forbid)) {
      return false
    }
  }
  
  return true
}