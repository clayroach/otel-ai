-- Service Topology Materialized Views Migration
-- Issue #161: Optimize ClickHouse service graph queries with materialized views
-- Purpose: Pre-aggregate service dependencies to prevent OOM errors with large datasets
-- Date: 2025-09-29

-- Drop existing views if they exist (for re-running migrations)
DROP TABLE IF EXISTS service_dependencies_5min_mv;
DROP TABLE IF EXISTS service_dependencies_hourly_mv;
DROP TABLE IF EXISTS service_topology_5min_mv;

-- =============================================================================
-- 5-Minute Window Service Dependencies Materialized View
-- =============================================================================
-- This view aggregates service-to-service dependencies in 5-minute windows
-- Uses AggregatingMergeTree with *State combinators for efficient storage

CREATE MATERIALIZED VIEW IF NOT EXISTS service_dependencies_5min_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (window_start, parent_service, child_service, parent_operation, child_operation)
PRIMARY KEY (window_start, parent_service, child_service)
TTL window_start + INTERVAL 30 DAY  -- Keep 30 days of 5-min aggregations
AS SELECT
    toStartOfFiveMinute(p.start_time) as window_start,
    p.service_name as parent_service,
    p.operation_name as parent_operation,
    c.service_name as child_service,
    c.operation_name as child_operation,
    countState() as call_count_state,
    avgState(c.duration_ns) as avg_duration_state,
    quantileState(0.50)(c.duration_ns) as p50_duration_state,
    quantileState(0.95)(c.duration_ns) as p95_duration_state,
    quantileState(0.99)(c.duration_ns) as p99_duration_state,
    countIfState(c.status_code = 'ERROR' OR c.status_code = 'STATUS_CODE_ERROR' OR c.status_code = '2') as error_count_state,
    minState(c.duration_ns) as min_duration_state,
    maxState(c.duration_ns) as max_duration_state
FROM traces p
INNER JOIN traces c ON
    c.trace_id = p.trace_id
    AND c.parent_span_id = p.span_id
    AND c.service_name != p.service_name
WHERE
    p.start_time >= now() - INTERVAL 2 DAY  -- Only process recent data on creation
GROUP BY
    window_start,
    parent_service,
    parent_operation,
    child_service,
    child_operation;

-- =============================================================================
-- Hourly Service Dependencies Materialized View
-- =============================================================================
-- This view aggregates service-to-service dependencies in hourly windows
-- Useful for longer time range queries

CREATE MATERIALIZED VIEW IF NOT EXISTS service_dependencies_hourly_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (window_start, parent_service, child_service)
PRIMARY KEY (window_start, parent_service, child_service)
TTL window_start + INTERVAL 90 DAY  -- Keep 90 days of hourly aggregations
AS SELECT
    toStartOfHour(p.start_time) as window_start,
    p.service_name as parent_service,
    c.service_name as child_service,
    -- Aggregate at service level (not operation level) for hourly view
    countState() as call_count_state,
    avgState(c.duration_ns) as avg_duration_state,
    quantileState(0.50)(c.duration_ns) as p50_duration_state,
    quantileState(0.95)(c.duration_ns) as p95_duration_state,
    quantileState(0.99)(c.duration_ns) as p99_duration_state,
    countIfState(c.status_code = 'ERROR' OR c.status_code = 'STATUS_CODE_ERROR' OR c.status_code = '2') as error_count_state,
    minState(c.duration_ns) as min_duration_state,
    maxState(c.duration_ns) as max_duration_state
FROM traces p
INNER JOIN traces c ON
    c.trace_id = p.trace_id
    AND c.parent_span_id = p.span_id
    AND c.service_name != p.service_name
WHERE
    p.start_time >= now() - INTERVAL 7 DAY  -- Only process recent data on creation
GROUP BY
    window_start,
    parent_service,
    child_service;

-- =============================================================================
-- 5-Minute Service Topology Materialized View
-- =============================================================================
-- This view aggregates service-level metrics in 5-minute windows

CREATE MATERIALIZED VIEW IF NOT EXISTS service_topology_5min_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (window_start, service_name, operation_name, span_kind)
PRIMARY KEY (window_start, service_name)
TTL window_start + INTERVAL 30 DAY  -- Keep 30 days of 5-min aggregations
AS SELECT
    toStartOfFiveMinute(start_time) as window_start,
    service_name,
    operation_name,
    span_kind,
    countState() as total_spans_state,
    countIfState(parent_span_id = '') as root_spans_state,
    countIfState(status_code = 'ERROR' OR status_code = 'STATUS_CODE_ERROR' OR status_code = '2') as error_spans_state,
    avgState(duration_ns) as avg_duration_state,
    quantileState(0.50)(duration_ns) as p50_duration_state,
    quantileState(0.95)(duration_ns) as p95_duration_state,
    quantileState(0.99)(duration_ns) as p99_duration_state,
    uniqState(trace_id) as unique_traces_state,
    minState(duration_ns) as min_duration_state,
    maxState(duration_ns) as max_duration_state
FROM traces
WHERE
    start_time >= now() - INTERVAL 2 DAY  -- Only process recent data on creation
GROUP BY
    window_start,
    service_name,
    operation_name,
    span_kind;

-- =============================================================================
-- Helper Views for Querying Materialized Data
-- =============================================================================

-- Create a view to easily query 5-minute dependencies
CREATE VIEW IF NOT EXISTS service_dependencies_5min AS
SELECT
    window_start,
    parent_service,
    parent_operation,
    child_service,
    child_operation,
    countMerge(call_count_state) as call_count,
    avgMerge(avg_duration_state) / 1000000 as avg_duration_ms,
    quantileMerge(0.50)(p50_duration_state) / 1000000 as p50_duration_ms,
    quantileMerge(0.95)(p95_duration_state) / 1000000 as p95_duration_ms,
    quantileMerge(0.99)(p99_duration_state) / 1000000 as p99_duration_ms,
    countMerge(error_count_state) as error_count,
    minMerge(min_duration_state) / 1000000 as min_duration_ms,
    maxMerge(max_duration_state) / 1000000 as max_duration_ms,
    countMerge(error_count_state) * 100.0 / countMerge(call_count_state) as error_rate_percent
FROM service_dependencies_5min_mv
GROUP BY
    window_start,
    parent_service,
    parent_operation,
    child_service,
    child_operation;

-- Create a view to easily query hourly dependencies
CREATE VIEW IF NOT EXISTS service_dependencies_hourly AS
SELECT
    window_start,
    parent_service,
    child_service,
    countMerge(call_count_state) as call_count,
    avgMerge(avg_duration_state) / 1000000 as avg_duration_ms,
    quantileMerge(0.50)(p50_duration_state) / 1000000 as p50_duration_ms,
    quantileMerge(0.95)(p95_duration_state) / 1000000 as p95_duration_ms,
    quantileMerge(0.99)(p99_duration_state) / 1000000 as p99_duration_ms,
    countMerge(error_count_state) as error_count,
    minMerge(min_duration_state) / 1000000 as min_duration_ms,
    maxMerge(max_duration_state) / 1000000 as max_duration_ms,
    countMerge(error_count_state) * 100.0 / countMerge(call_count_state) as error_rate_percent
FROM service_dependencies_hourly_mv
GROUP BY
    window_start,
    parent_service,
    child_service;

-- Create a view to easily query 5-minute topology
CREATE VIEW IF NOT EXISTS service_topology_5min AS
SELECT
    window_start,
    service_name,
    operation_name,
    span_kind,
    countMerge(total_spans_state) as total_spans,
    countMerge(root_spans_state) as root_spans,
    countMerge(error_spans_state) as error_spans,
    avgMerge(avg_duration_state) / 1000000 as avg_duration_ms,
    quantileMerge(0.50)(p50_duration_state) / 1000000 as p50_duration_ms,
    quantileMerge(0.95)(p95_duration_state) / 1000000 as p95_duration_ms,
    quantileMerge(0.99)(p99_duration_state) / 1000000 as p99_duration_ms,
    uniqMerge(unique_traces_state) as unique_traces,
    minMerge(min_duration_state) / 1000000 as min_duration_ms,
    maxMerge(max_duration_state) / 1000000 as max_duration_ms,
    countMerge(error_spans_state) * 100.0 / countMerge(total_spans_state) as error_rate_percent
FROM service_topology_5min_mv
GROUP BY
    window_start,
    service_name,
    operation_name,
    span_kind;

-- =============================================================================
-- Monitoring Views for MV Health
-- =============================================================================

-- Create a monitoring view to check MV lag
CREATE VIEW IF NOT EXISTS mv_monitoring AS
SELECT
    'service_dependencies_5min_mv' as view_name,
    max(window_start) as last_update,
    now() - max(window_start) as lag_seconds,
    count() as total_rows
FROM service_dependencies_5min_mv
UNION ALL
SELECT
    'service_dependencies_hourly_mv' as view_name,
    max(window_start) as last_update,
    now() - max(window_start) as lag_seconds,
    count() as total_rows
FROM service_dependencies_hourly_mv
UNION ALL
SELECT
    'service_topology_5min_mv' as view_name,
    max(window_start) as last_update,
    now() - max(window_start) as lag_seconds,
    count() as total_rows
FROM service_topology_5min_mv;

-- =============================================================================
-- Grant Permissions (adjust based on your user setup)
-- =============================================================================
-- GRANT SELECT ON service_dependencies_5min TO otel;
-- GRANT SELECT ON service_dependencies_hourly TO otel;
-- GRANT SELECT ON service_topology_5min TO otel;
-- GRANT SELECT ON mv_monitoring TO otel;

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Note: After running this migration:
-- 1. Monitor the mv_monitoring view to ensure MVs are updating
-- 2. Query the helper views (service_dependencies_5min, etc.) for aggregated data
-- 3. Update application queries to use MVs with fallback to raw queries
-- 4. Consider backfilling historical data if needed (not done automatically to avoid OOM)