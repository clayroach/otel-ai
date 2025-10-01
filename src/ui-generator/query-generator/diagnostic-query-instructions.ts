/**
 * Unified Diagnostic Query Instructions
 *
 * This module provides common instructions and patterns for generating
 * diagnostic queries across both SQL-specific models and general LLM models.
 *
 * Eliminates duplication between service-clickhouse-ai.ts and llm-query-generator.ts
 */

import { CriticalPath } from './types.js'

export interface DiagnosticQueryRequirements {
  traceFiltering: boolean
  errorAnalysis: boolean
  volumeContext: boolean
  bottleneckDetection: boolean
  operationBreakdown: boolean
  healthScoring: boolean
  realTimeFocus: boolean
  anomalyDetection: boolean
}

export interface DiagnosticQueryInstructions {
  basePrompt: string
  sqlRequirements: string
  diagnosticPatterns: string
  traceFilteringPattern: string
  schemaDefinition: string
  validationRules: string[]
}

/**
 * Core diagnostic requirements that should be included in all diagnostic queries
 */
export const CORE_DIAGNOSTIC_REQUIREMENTS: DiagnosticQueryRequirements = {
  traceFiltering: true, // Focus on problematic traces first
  errorAnalysis: true, // Include error rates and patterns
  volumeContext: true, // Include request counts for context
  bottleneckDetection: true, // Calculate total time impact metrics
  operationBreakdown: true, // Group by operation_name for detail
  healthScoring: true, // Provide CRITICAL/WARNING/HEALTHY categories
  realTimeFocus: true, // Use 15-minute windows for recent data
  anomalyDetection: false // Optional: statistical anomaly detection
}

/**
 * Trace-level filtering pattern for identifying problematic traces
 */
export const TRACE_FILTERING_PATTERN = (services: string[]) => `
WITH problematic_traces AS (
  SELECT DISTINCT trace_id
  FROM traces 
  WHERE service_name IN (${services.map((s) => `'${s}'`).join(', ')})
    AND start_time >= now() - INTERVAL 15 MINUTE
    AND (
      -- Slow traces (over 1 second duration)
      duration_ns/1000000 > 1000
      -- OR traces with errors
      OR status_code != 'OK'
      -- OR traces with high span count (complex operations)  
      OR trace_id IN (
        SELECT trace_id 
        FROM traces 
        GROUP BY trace_id 
        HAVING count() > 20
      )
    )
)`

/**
 * Core diagnostic SQL patterns that should be included
 */
export const DIAGNOSTIC_SQL_PATTERNS = {
  errorAnalysis: `
  countIf(status_code != 'OK') AS error_count,
  round(countIf(status_code != 'OK') * 100.0 / count(), 2) AS error_rate_pct`,

  volumeContext: `
  count() AS request_count`,

  bottleneckDetection: `
  count() AS request_count,
  quantile(0.95)(duration_ns/1000000) AS p95_latency_ms`,

  // DANGEROUS PATTERN - intentionally kept for validation testing
  // This pattern WILL cause ILLEGAL_AGGREGATION if not caught by validation
  // ONLY use in controlled test environments to verify validation works
  dangerousPattern: `
  count() * quantile(0.95)(duration_ns/1000000) AS dangerous_metric -- ILLEGAL_AGGREGATION`,

  operationBreakdown: `
  GROUP BY service_name, operation_name`,

  healthScoring: `
  CASE 
    WHEN error_rate_pct > 5 THEN 'CRITICAL'
    WHEN error_rate_pct > 1 OR p95_ms > 1000 THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS health_status`,

  realTimeFocus: `
  AND start_time >= now() - INTERVAL 15 MINUTE`,

  latencyMetrics: `
  quantile(0.5)(duration_ns/1000000) AS p50_ms,
  quantile(0.95)(duration_ns/1000000) AS p95_ms,
  quantile(0.99)(duration_ns/1000000) AS p99_ms`,

  triageOrdering: `
  ORDER BY 
    CASE health_status 
      WHEN 'CRITICAL' THEN 1 
      WHEN 'WARNING' THEN 2 
      ELSE 3 
    END,
    error_rate_pct DESC,
    total_time_impact_ms DESC`
}

/**
 * ClickHouse schema definition for consistent reference
 */
export const CLICKHOUSE_SCHEMA_DEFINITION = `
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
- span_attributes (Map(String, String)): Span-level attributes
- resource_attributes (Map(String, String)): Resource attributes`

/**
 * Create comprehensive diagnostic query instructions (original version for fallback)
 */
export const createSQLModelInstructionsComprehensive = (
  path: CriticalPath,
  analysisGoal: string,
  requirements: DiagnosticQueryRequirements = CORE_DIAGNOSTIC_REQUIREMENTS
): DiagnosticQueryInstructions => {
  return {
    basePrompt: `Generate a ClickHouse SQL query for diagnostic analysis of this critical path:

Services: ${path.services.join(', ')}
Goal: ${analysisGoal}

REQUIRED SQL PATTERNS (use ALL of these):`,

    traceFilteringPattern: requirements.traceFiltering
      ? TRACE_FILTERING_PATTERN([...path.services])
      : '',

    sqlRequirements: `
1. TRACE-LEVEL ANALYSIS (identify problematic traces first):
${requirements.traceFiltering ? TRACE_FILTERING_PATTERN([...path.services]) : '-- Trace filtering disabled'}

2. ERROR ANALYSIS:
${requirements.errorAnalysis ? DIAGNOSTIC_SQL_PATTERNS.errorAnalysis : '-- Error analysis disabled'}

3. VOLUME AND LATENCY CONTEXT:
${requirements.volumeContext ? DIAGNOSTIC_SQL_PATTERNS.volumeContext + ',\n' + DIAGNOSTIC_SQL_PATTERNS.latencyMetrics : '-- Volume context disabled'}

4. BOTTLENECK DETECTION:
${requirements.bottleneckDetection ? DIAGNOSTIC_SQL_PATTERNS.bottleneckDetection : '-- Bottleneck detection disabled'}

5. OPERATION BREAKDOWN:
${requirements.operationBreakdown ? DIAGNOSTIC_SQL_PATTERNS.operationBreakdown : '-- Operation breakdown disabled'}

6. HEALTH SCORING:
${requirements.healthScoring ? DIAGNOSTIC_SQL_PATTERNS.healthScoring : '-- Health scoring disabled'}`,

    diagnosticPatterns: `
Join the problematic_traces CTE to focus only on traces with issues.
Filter WHERE request_count > 5 to remove noise.
${requirements.healthScoring ? DIAGNOSTIC_SQL_PATTERNS.triageOrdering : 'ORDER BY error_rate_pct DESC, p95_ms DESC'}`,

    schemaDefinition: CLICKHOUSE_SCHEMA_DEFINITION,

    validationRules: [
      'Must filter by service_name IN (...)',
      'Must use trace-level filtering if enabled',
      'Must include error analysis if enabled',
      'Must include volume context if enabled',
      'Must use 15-minute time windows for real-time focus'
    ]
  }
}

/**
 * Create simplified diagnostic query instructions for SQL-specific models (optimized for performance)
 */
/**
 * Escape single quotes in service names to prevent SQL injection
 */
const escapeServiceName = (serviceName: string): string => {
  // Replace single quotes with two single quotes (SQL standard escaping)
  return serviceName.replace(/'/g, "''")
}

export const createSQLModelInstructions = (
  path: CriticalPath,
  analysisGoal: string,
  _requirements: DiagnosticQueryRequirements = CORE_DIAGNOSTIC_REQUIREMENTS
): DiagnosticQueryInstructions => {
  const services = path.services.map((s) => `'${escapeServiceName(s)}'`).join(', ')

  // Create extremely explicit, goal-specific SQL queries
  let exactSQL = ''
  let description = ''

  if (
    analysisGoal.toLowerCase().includes('latency') ||
    analysisGoal.toLowerCase().includes('performance')
  ) {
    exactSQL = `SELECT service_name, operation_name, 
  quantile(0.5)(duration_ns/1000000) as p50_ms,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  quantile(0.99)(duration_ns/1000000) as p99_ms
FROM traces 
WHERE service_name IN (${services})
  AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING count() > 5
ORDER BY p95_ms DESC`
    description = 'Latency analysis with percentiles'
  } else if (
    analysisGoal.toLowerCase().includes('error') ||
    analysisGoal.toLowerCase().includes('reliability')
  ) {
    exactSQL = `SELECT service_name, operation_name, 
  countIf(status_code != 'OK') as error_count,
  round(countIf(status_code != 'OK') * 100.0 / count(), 2) as error_rate_pct
FROM traces 
WHERE service_name IN (${services})
  AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING count() > 5
ORDER BY error_rate_pct DESC, error_count DESC`
    description = 'Error analysis with rates'
  } else if (
    analysisGoal.toLowerCase().includes('bottleneck') ||
    analysisGoal.toLowerCase().includes('impact')
  ) {
    exactSQL = `SELECT service_name, operation_name,
  count() as request_count,
  quantile(0.95)(duration_ns/1000000) as p95_ms
FROM traces 
WHERE service_name IN (${services})
  AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING count() > 5
ORDER BY total_time_impact_ms DESC`
    description = 'Bottleneck analysis with time impact'
  } else if (
    analysisGoal.toLowerCase().includes('throughput') ||
    analysisGoal.toLowerCase().includes('volume')
  ) {
    exactSQL = `SELECT service_name, operation_name, 
  count() AS request_count,
  count() / (15 * 60) AS requests_per_second
FROM traces 
WHERE service_name IN (${services})
  AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING count() > 5
ORDER BY request_count DESC`
    description = 'Throughput analysis with volume'
  } else {
    // Default comprehensive query
    exactSQL = `SELECT service_name, operation_name, 
  count() AS request_count,
  countIf(status_code != 'OK') AS error_count,
  round(countIf(status_code != 'OK') * 100.0 / count(), 2) AS error_rate_pct,
  quantile(0.95)(duration_ns/1000000) AS p95_ms
FROM traces 
WHERE service_name IN (${services})
  AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING count() > 5
ORDER BY error_rate_pct DESC, p95_ms DESC`
    description = 'General diagnostic analysis'
  }

  return {
    basePrompt: `Generate a ClickHouse SQL query for diagnostic analysis: ${analysisGoal}

Services: ${services}
Focus: ${
      analysisGoal.toLowerCase().includes('latency')
        ? 'latency percentiles'
        : analysisGoal.toLowerCase().includes('error')
          ? 'error rates'
          : analysisGoal.toLowerCase().includes('bottleneck')
            ? 'performance impact'
            : analysisGoal.toLowerCase().includes('throughput')
              ? 'request volume'
              : 'general analysis'
    }`,

    traceFilteringPattern: '',

    sqlRequirements: `REQUIRED SQL STRUCTURE:

${exactSQL}

DESCRIPTION: ${description}

DIAGNOSTIC PATTERNS:
1. TRACE-LEVEL ANALYSIS: Focus on specific trace data
2. ERROR ANALYSIS: Include error rates and status patterns  
3. VOLUME CONTEXT: Use count() AS request_count for volume metrics
4. Use FROM traces table for all queries
5. Use problematic_traces pattern when analyzing errors`,

    diagnosticPatterns: `Focus on ${analysisGoal}. Recent data (15 min). Group by service/operation.`,

    schemaDefinition: `traces: trace_id, service_name, operation_name, start_time, duration_ns, status_code`,

    validationRules: [
      'Filter services',
      '15-minute window',
      'Group by service/operation',
      `Focus: ${analysisGoal}`
    ]
  }
}

/**
 * Create unified diagnostic query instructions for general LLM models
 */
export const createGeneralLLMInstructions = (
  path: CriticalPath,
  analysisGoal: string,
  requirements: DiagnosticQueryRequirements = CORE_DIAGNOSTIC_REQUIREMENTS
): DiagnosticQueryInstructions => {
  const services = path.services.map((s) => `'${s.replace(/'/g, "''")}'`)

  return {
    basePrompt: `You are a ClickHouse expert specializing in DIAGNOSTIC queries for critical path analysis.

Critical Path: ${path.name}
Services: ${path.services.join(', ')}
Analysis Goal: ${analysisGoal}

DIAGNOSTIC REQUIREMENTS (ALL MUST BE INCLUDED):`,

    traceFilteringPattern: requirements.traceFiltering
      ? TRACE_FILTERING_PATTERN([...path.services])
      : '',

    sqlRequirements: `
1. TRACE-LEVEL ANALYSIS: ${requirements.traceFiltering ? 'Identify problematic traces first using CTE' : 'DISABLED'}
2. ERROR ANALYSIS: ${requirements.errorAnalysis ? "Include error rates (countIf(status_code != 'OK')) and failure patterns" : 'DISABLED'}  
3. VOLUME CONTEXT: ${requirements.volumeContext ? 'Include request counts (count()) to contextualize performance metrics' : 'DISABLED'}
4. BOTTLENECK DETECTION: ${requirements.bottleneckDetection ? 'Calculate total time impact (request_count * latency)' : 'DISABLED'}
5. OPERATION BREAKDOWN: ${requirements.operationBreakdown ? 'Group by operation_name within services for specific diagnosis' : 'DISABLED'}
6. HEALTH SCORING: ${requirements.healthScoring ? 'Categorize services as CRITICAL/WARNING/HEALTHY for triage using CASE statements' : 'DISABLED'}
7. REAL-TIME FOCUS: ${requirements.realTimeFocus ? 'Use 15-minute windows (now() - INTERVAL 15 MINUTE) for recent diagnosis' : 'DISABLED'}
8. ANOMALY DETECTION: ${requirements.anomalyDetection ? 'Use statistical methods to flag performance regressions when appropriate' : 'DISABLED'}`,

    diagnosticPatterns: `
QUERY STRUCTURE REQUIREMENTS:
- Use CTEs (WITH clauses) for complex multi-level analysis
- Include multiple aggregation levels (operation, service, overall)
- Order results by severity/impact for immediate action (error_rate DESC, latency DESC)
- Filter out low-volume noise (request_count > 5)
- MUST filter by services: service_name IN (${services.join(', ')})`,

    schemaDefinition: CLICKHOUSE_SCHEMA_DEFINITION,

    validationRules: [
      'Query MUST help diagnose WHY this path is critical and WHAT specific actions to take',
      'Must focus on problematic traces, not aggregate all data',
      'Must provide actionable diagnostic recommendations',
      'Must include health scoring for immediate triage',
      'Must use recent time windows for real-time diagnosis'
    ]
  }
}

/**
 * Generate comprehensive prompt for SQL-specific models (original version for fallback)
 */
export const generateSQLModelPromptComprehensive = (
  path: CriticalPath,
  analysisGoal: string,
  requirements?: DiagnosticQueryRequirements
): string => {
  const instructions = createSQLModelInstructionsComprehensive(path, analysisGoal, requirements)

  return `${instructions.basePrompt}

${instructions.sqlRequirements}

${instructions.diagnosticPatterns}

${instructions.traceFilteringPattern ? `\nTrace filtering pattern:\n${instructions.traceFilteringPattern}` : ''}

${instructions.schemaDefinition}

VALIDATION RULES:
${instructions.validationRules.map((rule) => `- ${rule}`).join('\n')}

Write the complete ClickHouse SQL query only, no explanation:`
}

/**
 * Generate simplified prompt for SQL-specific models (optimized for performance)
 */
export const generateSQLModelPrompt = (
  path: CriticalPath,
  analysisGoal: string,
  requirements?: DiagnosticQueryRequirements
): string => {
  const instructions = createSQLModelInstructions(path, analysisGoal, requirements)

  return `${instructions.basePrompt}

REQUIRED SQL STRUCTURE:
${instructions.sqlRequirements}

FOCUS: ${instructions.diagnosticPatterns}

Table: traces
Schema: ${instructions.schemaDefinition}

RULES: ${instructions.validationRules.join(', ')}

Write the complete ClickHouse SQL query only - NO explanations or examples:`
}

/**
 * Generate complete prompt for general LLM models
 */
export const generateGeneralLLMPrompt = (
  path: CriticalPath,
  analysisGoal: string,
  requirements?: DiagnosticQueryRequirements
): string => {
  const instructions = createGeneralLLMInstructions(path, analysisGoal, requirements)

  return `${instructions.basePrompt}

${instructions.sqlRequirements}

${instructions.diagnosticPatterns}

${instructions.traceFilteringPattern ? `\nExample trace filtering pattern:\n${instructions.traceFilteringPattern}` : ''}

${instructions.schemaDefinition}

${instructions.validationRules.map((rule) => `- ${rule}`).join('\n')}

Return ONLY the SQL query without explanation or markdown blocks.`
}

/**
 * Example diagnostic query template for reference
 */
export const DIAGNOSTIC_QUERY_TEMPLATE = (services: string[]) => `
WITH problematic_traces AS (
  SELECT DISTINCT trace_id
  FROM traces 
  WHERE service_name IN (${services.map((s) => `'${s}'`).join(', ')})
    AND start_time >= now() - INTERVAL 15 MINUTE
    AND (
      duration_ns/1000000 > 1000  -- Slow traces
      OR status_code != 'OK'      -- Error traces  
      OR trace_id IN (
        SELECT trace_id FROM traces 
        GROUP BY trace_id HAVING count() > 20  -- Complex traces
      )
    )
),
diagnostic_analysis AS (
  SELECT 
    t.service_name,
    t.operation_name,
    count() AS problem_span_count,
    countIf(t.status_code != 'OK') AS error_count,
    round(countIf(t.status_code != 'OK') * 100.0 / count(), 2) AS error_rate_pct,
    quantile(0.5)(t.duration_ns/1000000) AS p50_ms,
    quantile(0.95)(t.duration_ns/1000000) AS p95_ms,
    count() AS request_count,
    quantile(0.95)(t.duration_ns/1000000) AS p95_latency_ms
  FROM traces t
  INNER JOIN problematic_traces pt ON t.trace_id = pt.trace_id
  WHERE t.service_name IN (${services.map((s) => `'${s}'`).join(', ')})
  GROUP BY t.service_name, t.operation_name
  HAVING problem_span_count > 5
)
SELECT 
  service_name,
  operation_name,
  problem_span_count,
  error_rate_pct,
  p95_ms,
  total_time_impact_ms,
  CASE 
    WHEN error_rate_pct > 5 THEN 'CRITICAL'
    WHEN error_rate_pct > 1 OR p95_ms > 1000 THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS health_status,
  CASE 
    WHEN error_rate_pct > 5 THEN 'High error rate - check service health'
    WHEN p95_ms > 1500 THEN 'High latency - check dependencies'
    WHEN problem_span_count > 100 THEN 'High volume in problems - check capacity'
    ELSE 'Performance regression - compare to baseline'
  END AS recommended_action
FROM diagnostic_analysis
ORDER BY 
  CASE health_status 
    WHEN 'CRITICAL' THEN 1 
    WHEN 'WARNING' THEN 2 
    ELSE 3 
  END,
  total_time_impact_ms DESC`

/**
 * Validate that a generated query meets diagnostic requirements
 */
export const validateDiagnosticQuery = (
  sql: string,
  requirements: DiagnosticQueryRequirements
): { isValid: boolean; missingRequirements: string[] } => {
  const upperSQL = sql.toUpperCase()
  const missingRequirements: string[] = []

  // Basic SQL validation
  if (!upperSQL.includes('SELECT') || !upperSQL.includes('FROM TRACES')) {
    missingRequirements.push('Basic SQL structure (SELECT FROM traces)')
  }

  // Check diagnostic requirements
  if (
    requirements.traceFiltering &&
    !upperSQL.includes('WITH') &&
    !sql.toLowerCase().includes('problematic_traces')
  ) {
    missingRequirements.push('Trace-level filtering')
  }

  if (requirements.errorAnalysis && !upperSQL.includes('STATUS_CODE')) {
    missingRequirements.push('Error analysis')
  }

  if (requirements.volumeContext && !upperSQL.includes('COUNT()')) {
    missingRequirements.push('Volume context')
  }

  if (
    requirements.healthScoring &&
    !upperSQL.includes('CASE') &&
    !sql.toLowerCase().includes('critical')
  ) {
    missingRequirements.push('Health scoring')
  }

  if (
    requirements.realTimeFocus &&
    !upperSQL.includes('INTERVAL') &&
    !upperSQL.includes('MINUTE')
  ) {
    missingRequirements.push('Real-time focus')
  }

  // Strict validation: query is valid only if it meets ALL required diagnostic features
  const isValid = missingRequirements.length === 0

  return {
    isValid,
    missingRequirements
  }
}
