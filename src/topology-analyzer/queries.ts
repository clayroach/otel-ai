/**
 * ClickHouse Query Layer for AI Analysis
 *
 * Specialized queries for extracting application architecture insights from trace data.
 * Focuses on service topology, dependency mapping, and data flow analysis.
 */

import type { ClickHouseClient } from '@clickhouse/client'
import { Effect } from 'effect'
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
  // Topology visualization extensions
  rate_per_second: number
  error_rate_percent: number
  health_status: 'healthy' | 'warning' | 'degraded' | 'critical' | 'unavailable'
  runtime_language?: string
  runtime_name?: string
  component?: string
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
   * Optimized: Array-based approach to avoid expensive self-joins
   * Issue #161: This is the FALLBACK query when aggregated tables are not available
   * NOTE: Prefer using aggregated tables via OptimizedQueries.getServiceDependenciesFromView()
   */
  getServiceDependencies: (timeRangeHours: number = 24) => `
    WITH trace_data AS (
      SELECT
        trace_id,
        groupArray((span_id, parent_span_id, service_name, operation_name, duration_ns, status_code)) as spans
      FROM traces
      WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      GROUP BY trace_id
      HAVING length(spans) > 1  -- Skip single-span traces for dependencies
    )
    SELECT
      parent.3 as service_name,
      parent.4 as operation_name,
      child.3 as dependent_service,
      child.4 as dependent_operation,
      count(*) as call_count,
      avg(toFloat64(child.5) / 1000000) as avg_duration_ms,
      countIf(child.6 = 'ERROR') as error_count,
      count(*) as total_count
    FROM (
      SELECT
        arrayJoin(spans) as parent,
        arrayFilter(x -> x.2 = parent.1 AND x.3 != parent.3, spans) as matching_children
      FROM trace_data
      WHERE length(matching_children) > 0
    ) ARRAY JOIN matching_children as child
    GROUP BY service_name, operation_name, dependent_service, dependent_operation
    HAVING call_count >= 1
    ORDER BY call_count DESC
    LIMIT 1000
    SETTINGS max_memory_usage = 500000000,
             max_execution_time = 30,
             max_block_size = 8192
  `,

  /**
   * Get service topology information including span types and characteristics
   * Optimized: Add memory protection settings for large datasets
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
      uniq(trace_id) as unique_traces,
      -- Topology visualization extensions
      count(*) / (${timeRangeHours} * 60) as rate_per_second,
      (countIf(status_code = 'ERROR') * 100.0) / count(*) as error_rate_percent,
      CASE
        WHEN (countIf(status_code = 'ERROR') * 100.0) / count(*) > 5 THEN 'critical'
        WHEN (countIf(status_code = 'ERROR') * 100.0) / count(*) > 1 THEN 'warning'
        WHEN quantile(0.95)(duration_ns / 1000000) > 500 THEN 'degraded'
        WHEN quantile(0.95)(duration_ns / 1000000) > 100 THEN 'warning'
        ELSE 'healthy'
      END as health_status
      -- Note: Removed resource_attributes and span_attributes access to prevent OOM (GitHub #57)
    FROM traces
    WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
    GROUP BY service_name, operation_name, span_kind
    HAVING total_spans >= 1  -- Show all operations, even single spans
    ORDER BY total_spans DESC
    LIMIT 500
    SETTINGS max_memory_usage = 1000000000,  -- 1GB memory limit
             max_execution_time = 30          -- 30 second timeout
  `,

  /**
   * Analyze trace flows to understand request paths through the system
   * Memory-optimized version: Uses array functions instead of self-joins to prevent OOM
   */
  getTraceFlows: (limit: number = 100, timeRangeHours: number = 24) => `
    WITH sampled_traces AS (
      -- Select traces to analyze, including single-span traces
      SELECT trace_id
      FROM traces
      WHERE start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      GROUP BY trace_id
      HAVING count(*) >= 1  -- Include all traces, even single spans
      ORDER BY max(duration_ns) DESC
      LIMIT ${limit}
    ),
    span_hierarchy AS (
      -- Collect all spans per trace as arrays to avoid memory-intensive joins
      SELECT
        trace_id,
        groupArray((span_id, service_name, operation_name, parent_span_id, start_time, duration_ns / 1000000, span_kind, status_code)) as spans,
        -- Create lookup maps for efficient parent resolution
        groupArrayIf((span_id, service_name, operation_name), span_id != '') as span_lookup
      FROM traces t
      INNER JOIN sampled_traces st ON t.trace_id = st.trace_id
      WHERE t.start_time >= now() - INTERVAL ${timeRangeHours} HOUR
      GROUP BY trace_id
    )
    SELECT
      h.trace_id,
      span.2 as service_name,               -- service_name
      span.3 as operation_name,             -- operation_name
      -- Use arrayFirst to find parent service without expensive joins
      arrayFirst(x -> x.1 = span.4, h.span_lookup).2 as parent_service,
      arrayFirst(x -> x.1 = span.4, h.span_lookup).3 as parent_operation,
      span.5 as start_time,                 -- start_time
      span.6 as duration_ms,                -- duration_ms
      span.7 as span_kind,                  -- span_kind
      span.8 as status_code,                -- status_code
      -- Calculate level without recursive joins
      CASE
        WHEN span.4 = '' THEN 0  -- parent_span_id empty = root level
        WHEN arrayExists(x -> x.1 = span.4 AND x.4 = '', h.spans) THEN 1  -- parent is root
        ELSE 2  -- deeper nesting (simplified to avoid complex hierarchy)
      END as level
    FROM span_hierarchy h
    ARRAY JOIN h.spans as span
    ORDER BY h.trace_id, span.5
    SETTINGS max_memory_usage = 2000000000, max_execution_time = 30
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
    HAVING root_span_count >= 1  -- Show all root services, even rarely called ones
    ORDER BY root_span_count DESC
    LIMIT 100  -- Increased limit to capture more services
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
    HAVING span_count >= 1  -- Show all leaf services, even rarely called ones
    ORDER BY span_count DESC
    LIMIT 100  -- Increased limit to capture more services
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
    HAVING span_count >= 1  -- Include all traces, even single-span ones
    ORDER BY total_duration_ms DESC
    LIMIT 50  -- Increased to show more critical paths
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
    HAVING error_count >= 1  -- Show all errors, even single occurrences
    ORDER BY error_rate_percent DESC, error_count DESC
    LIMIT 100  -- Increased to capture more error patterns
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
 * Optimized queries using aggregated tables (Issue #161)
 */
export const OptimizedQueries = {
  /**
   * Get service dependencies from aggregated tables
   * Note: Uses SummingMergeTree, so we aggregate the pre-computed sums
   */
  getServiceDependenciesFromView: (timeRangeHours: number = 24) => {
    // Convert hours to minutes for more granular time windows
    const timeRangeMinutes = timeRangeHours * 60

    // For time windows <= 1 hour, use 5-minute aggregations
    if (timeRangeMinutes <= 60) {
      return `
        SELECT
          parent_service as service_name,
          parent_operation as operation_name,
          child_service as dependent_service,
          child_operation as dependent_operation,
          sum(call_count) as call_count,
          avg(avg_duration_ms) as avg_duration_ms,
          sum(error_count) as error_count,
          sum(total_count) as total_count
        FROM otel.service_dependencies_5min
        WHERE window_start >= now() - INTERVAL ${timeRangeMinutes} MINUTE
        GROUP BY parent_service, parent_operation, child_service, child_operation
        HAVING call_count >= 1
        ORDER BY call_count DESC
        LIMIT 500
      `
    } else if (timeRangeHours <= 24) {
      // For recent data (1h < time <= 24h), still use 5-minute aggregations
      return `
        SELECT
          parent_service as service_name,
          parent_operation as operation_name,
          child_service as dependent_service,
          child_operation as dependent_operation,
          sum(call_count) as call_count,
          avg(avg_duration_ms) as avg_duration_ms,
          sum(error_count) as error_count,
          sum(total_count) as total_count
        FROM otel.service_dependencies_5min
        WHERE window_start >= now() - INTERVAL ${timeRangeHours} HOUR
        GROUP BY parent_service, parent_operation, child_service, child_operation
        HAVING call_count >= 1
        ORDER BY call_count DESC
        LIMIT 500
      `
    } else {
      // For longer ranges (> 24h), use hourly aggregations
      return `
        SELECT
          parent_service as service_name,
          '' as operation_name,
          child_service as dependent_service,
          '' as dependent_operation,
          sum(call_count) as call_count,
          avg(avg_duration_ms) as avg_duration_ms,
          sum(error_count) as error_count,
          sum(total_count) as total_count
        FROM otel.service_dependencies_hourly
        WHERE window_start >= now() - INTERVAL ${timeRangeHours} HOUR
        GROUP BY parent_service, child_service
        HAVING call_count >= 1
        ORDER BY call_count DESC
        LIMIT 500
      `
    }
  },

  /**
   * Get service dependencies for specific minute windows (5, 15, 30 minutes)
   */
  getServiceDependenciesForMinutes: (minutes: number) => {
    // Always use 5-minute aggregations for sub-hour windows
    return `
      SELECT
        parent_service as service_name,
        parent_operation as operation_name,
        child_service as dependent_service,
        child_operation as dependent_operation,
        sum(call_count) as call_count,
        avg(avg_duration_ms) as avg_duration_ms,
        sum(error_count) as error_count,
        sum(total_count) as total_count
      FROM otel.service_dependencies_5min
      WHERE window_start >= now() - INTERVAL ${minutes} MINUTE
      GROUP BY parent_service, parent_operation, child_service, child_operation
      HAVING call_count >= 1
      ORDER BY call_count DESC
      LIMIT 500
    `
  },

  /**
   * Get service topology from aggregated tables
   * Note: service_topology uses VIEWs with Merge functions, so we just query them
   */
  getServiceTopologyFromView: (timeRangeHours: number = 24) => `
    SELECT
      service_name,
      operation_name,
      span_kind,
      total_spans,
      root_spans,
      error_spans,
      avg_duration_ms,
      p95_duration_ms,
      unique_traces,
      total_spans / (${timeRangeHours} * 60) as rate_per_second,
      error_rate_percent,
      CASE
        WHEN error_rate_percent > 5 THEN 'critical'
        WHEN error_rate_percent > 1 THEN 'warning'
        WHEN p95_duration_ms > 500 THEN 'degraded'
        WHEN p95_duration_ms > 100 THEN 'warning'
        ELSE 'healthy'
      END as health_status
    FROM service_topology_5min
    WHERE window_start >= now() - INTERVAL ${timeRangeHours} HOUR
    ORDER BY total_spans DESC
    LIMIT 500
  `
}

/**
 * Query builders for dynamic filtering
 */
export const QueryBuilders = {
  filterByServices: (baseQuery: string, services: string[]): string => {
    const serviceFilter = services.map((s) => `'${s}'`).join(', ')
    return baseQuery.replace(
      'WHERE start_time >=',
      `WHERE service_name IN (${serviceFilter}) AND start_time >=`
    )
  },

  filterByOperations: (baseQuery: string, operations: string[]): string => {
    const operationFilter = operations.map((o) => `'${o}'`).join(', ')
    return baseQuery.replace(
      'WHERE start_time >=',
      `WHERE operation_name IN (${operationFilter}) AND start_time >=`
    )
  }
}
