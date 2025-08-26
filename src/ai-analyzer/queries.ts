/**
 * ClickHouse Query Layer for AI Analysis
 * 
 * Specialized queries for extracting application architecture insights from trace data.
 * Focuses on service topology, dependency mapping, and data flow analysis.
 */

import { Effect } from 'effect'
import type { ClickHouseClient } from '@clickhouse/client'
import type { AnalysisError } from './types.js'

// Raw query result types
export interface ServiceDependencyRaw {
  service_name: string
  operation_name: string
  dependent_service: string
  dependent_operation: string
  call_count: number
  avg_duration_ms: number
  error_count: number
  total_count: number
}

export interface ServiceTopologyRaw {
  service_name: string
  operation_name: string
  span_kind: string
  total_spans: number
  root_spans: number
  error_spans: number
  avg_duration_ms: number
  p95_duration_ms: number
  unique_traces: number
}

export interface TraceFlowRaw {
  trace_id: string
  service_name: string
  operation_name: string
  parent_service: string | null
  parent_operation: string | null
  start_time: string
  duration_ms: number
  span_kind: string
  status_code: string
  level: number
}

/**
 * Core queries for application architecture discovery
 */
export const ArchitectureQueries = {
  
  /**
   * Discover service dependencies by analyzing parent-child span relationships
   */
  getServiceDependencies: (timeRangeHours: number = 24) => `
    SELECT 
      parent.service_name as service_name,
      parent.operation_name as operation_name,
      child.service_name as dependent_service,
      child.operation_name as dependent_operation,
      count(*) as call_count,
      avg(child.duration_ns / 1000000) as avg_duration_ms,
      countIf(child.status_code = 'ERROR') as error_count,
      count(*) as total_count
    FROM traces parent
    INNER JOIN traces child ON child.parent_span_id = parent.span_id
    WHERE parent.start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      AND child.start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      AND parent.service_name != child.service_name
    GROUP BY 
      parent.service_name, 
      parent.operation_name,
      child.service_name,
      child.operation_name
    ORDER BY call_count DESC
    LIMIT 1000
  `,

  /**
   * Get service topology information including span types and characteristics
   */
  getServiceTopology: (timeRangeHours: number = 24) => `
    SELECT 
      service_name,
      operation_name,
      span_kind,
      count(*) as total_spans,
      countIf(parent_span_id = '') as root_spans,
      countIf(status_code = 'ERROR') as error_spans,
      avg(duration_ns / 1000000) as avg_duration_ms,
      quantile(0.95)(duration_ns / 1000000) as p95_duration_ms,
      uniq(trace_id) as unique_traces
    FROM traces
    WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
    GROUP BY service_name, operation_name, span_kind
    HAVING total_spans >= 10  -- Filter out low-volume operations
    ORDER BY total_spans DESC
    LIMIT 500
  `,

  /**
   * Analyze trace flows to understand request paths through the system
   */
  getTraceFlows: (limit: number = 100, timeRangeHours: number = 24) => `
    WITH RECURSIVE trace_hierarchy AS (
      -- Root spans (entry points)
      SELECT 
        trace_id,
        span_id,
        service_name,
        operation_name,
        NULL as parent_service,
        NULL as parent_operation,
        start_time,
        duration_ns / 1000000 as duration_ms,
        span_kind,
        status_code,
        0 as level
      FROM traces
      WHERE parent_span_id = ''
        AND start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      
      UNION ALL
      
      -- Child spans
      SELECT 
        child.trace_id,
        child.span_id,
        child.service_name,
        child.operation_name,
        parent.service_name as parent_service,
        parent.operation_name as parent_operation,
        child.start_time,
        child.duration_ns / 1000000 as duration_ms,
        child.span_kind,
        child.status_code,
        parent.level + 1 as level
      FROM traces child
      INNER JOIN trace_hierarchy parent ON child.parent_span_id = parent.span_id
      WHERE child.start_time >= now() - INTERVAL ${timeRangeHours} HOUR
        AND parent.level < 10  -- Prevent infinite recursion
    )
    SELECT * FROM trace_hierarchy
    WHERE trace_id IN (
      SELECT trace_id 
      FROM trace_hierarchy 
      GROUP BY trace_id 
      HAVING count(*) BETWEEN 3 AND 50  -- Focus on meaningful traces
      ORDER BY max(duration_ms) DESC
      LIMIT ${limit}
    )
    ORDER BY trace_id, level, start_time
  `,

  /**
   * Identify root services (entry points to the application)
   */
  getRootServices: (timeRangeHours: number = 24) => `
    SELECT 
      service_name,
      operation_name,
      count(*) as root_span_count,
      avg(duration_ns / 1000000) as avg_duration_ms,
      countIf(status_code = 'ERROR') as error_count,
      span_kind
    FROM traces
    WHERE parent_span_id = ''
      AND start_time >= now() - INTERVAL ${timeRangeHours} HOUR
    GROUP BY service_name, operation_name, span_kind
    HAVING root_span_count >= 5
    ORDER BY root_span_count DESC
    LIMIT 50
  `,

  /**
   * Identify leaf services (services that don't call others)
   */
  getLeafServices: (timeRangeHours: number = 24) => `
    SELECT 
      service_name,
      operation_name,
      count(*) as span_count,
      avg(duration_ns / 1000000) as avg_duration_ms,
      span_kind
    FROM traces
    WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      AND span_id NOT IN (
        SELECT DISTINCT parent_span_id 
        FROM traces 
        WHERE parent_span_id != ''
          AND start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      )
    GROUP BY service_name, operation_name, span_kind
    HAVING span_count >= 5
    ORDER BY span_count DESC
    LIMIT 50
  `,

  /**
   * Get critical path analysis - longest running trace paths
   */
  getCriticalPaths: (timeRangeHours: number = 24) => `
    SELECT 
      trace_id,
      arrayStringConcat(groupArray(service_name), ' -> ') as service_path,
      arrayStringConcat(groupArray(operation_name), ' -> ') as operation_path,
      sum(duration_ns) / 1000000 as total_duration_ms,
      count(*) as span_count,
      countIf(status_code = 'ERROR') as error_count
    FROM traces
    WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
    GROUP BY trace_id
    HAVING span_count >= 3
    ORDER BY total_duration_ms DESC
    LIMIT 20
  `,

  /**
   * Get error patterns across services
   */
  getErrorPatterns: (timeRangeHours: number = 24) => `
    SELECT 
      service_name,
      operation_name,
      status_code,
      count(*) as error_count,
      count(*) * 100.0 / (
        SELECT count(*) 
        FROM traces t2 
        WHERE t2.service_name = traces.service_name 
          AND t2.operation_name = traces.operation_name
          AND t2.start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      ) as error_rate_percent
    FROM traces
    WHERE status_code = 'ERROR'
      AND start_time >= now() - INTERVAL ${timeRangeHours} HOUR
    GROUP BY service_name, operation_name, status_code
    HAVING error_count >= 5
    ORDER BY error_rate_percent DESC, error_count DESC
    LIMIT 50
  `
}

/**
 * Query execution utilities
 */
export const executeAnalysisQuery = <T>(
  query: string,
  connection: ClickHouseClient
): Effect.Effect<T[], AnalysisError, never> =>
  Effect.tryPromise({
    try: async () => {
      const result = await connection.query({
        query,
        format: 'JSONEachRow'
      })
      return result.json()
    },
    catch: (error): AnalysisError => ({
      _tag: 'QueryError',
      message: error instanceof Error ? error.message : 'Unknown query error',
      query: query.slice(0, 200) + '...' // Truncate for logging
    })
  })

/**
 * Helper to build time-filtered queries
 */
export const withTimeFilter = (baseQuery: string, timeRangeHours: number): string =>
  baseQuery.replace(/INTERVAL \d+ HOUR/g, `INTERVAL ${timeRangeHours} HOUR`)

/**
 * Query builders for dynamic filtering
 */
export const QueryBuilders = {
  filterByServices: (baseQuery: string, services: string[]): string => {
    const serviceFilter = services.map(s => `'${s}'`).join(', ')
    return baseQuery.replace(
      'WHERE start_time >=', 
      `WHERE service_name IN (${serviceFilter}) AND start_time >=`
    )
  },

  filterByOperations: (baseQuery: string, operations: string[]): string => {
    const operationFilter = operations.map(o => `'${o}'`).join(', ')
    return baseQuery.replace(
      'WHERE start_time >=',
      `WHERE operation_name IN (${operationFilter}) AND start_time >=`
    )
  }
}