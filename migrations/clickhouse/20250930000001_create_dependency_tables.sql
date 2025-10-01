-- Service Dependency Aggregation Tables
-- Migration: 20250930000001_create_dependency_tables
-- Creates tables for service dependency tracking and aggregation

-- Materialized view for span relationships extraction
-- Extracts parent-child span relationships for dependency analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS span_relationships
ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (trace_id, span_id, timestamp)
SETTINGS index_granularity = 8192
POPULATE AS
SELECT
    trace_id,
    span_id,
    parent_span_id,
    service_name,
    operation_name,
    status_code,
    duration_ns,
    start_time as timestamp
FROM otel.traces
WHERE parent_span_id != ''
  AND parent_span_id IS NOT NULL;

-- 5-minute service dependency aggregation table
CREATE TABLE IF NOT EXISTS service_dependencies_5min (
    window_start DateTime CODEC(Delta(4), ZSTD(1)),
    parent_service LowCardinality(String) CODEC(ZSTD(1)),
    parent_operation LowCardinality(String) CODEC(ZSTD(1)),
    child_service LowCardinality(String) CODEC(ZSTD(1)),
    child_operation LowCardinality(String) CODEC(ZSTD(1)),
    call_count UInt64 CODEC(ZSTD(1)),
    avg_duration_ms Float64 CODEC(ZSTD(1)),
    p95_duration_ms Float64 CODEC(ZSTD(1)),
    error_count UInt64 CODEC(ZSTD(1)),
    total_count UInt64 CODEC(ZSTD(1)),

    -- Indexes for efficient querying
    INDEX idx_window window_start TYPE minmax GRANULARITY 1,
    INDEX idx_parent parent_service TYPE bloom_filter GRANULARITY 4,
    INDEX idx_child child_service TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toDate(window_start)
ORDER BY (window_start, parent_service, parent_operation, child_service, child_operation)
SETTINGS index_granularity = 8192,
         ttl_only_drop_parts = 1;

-- Hourly service dependency aggregation table (simplified schema)
CREATE TABLE IF NOT EXISTS service_dependencies_hourly (
    window_start DateTime CODEC(Delta(4), ZSTD(1)),
    parent_service LowCardinality(String) CODEC(ZSTD(1)),
    child_service LowCardinality(String) CODEC(ZSTD(1)),
    call_count UInt64 CODEC(ZSTD(1)),
    avg_duration_ms Float64 CODEC(ZSTD(1)),
    p95_duration_ms Float64 CODEC(ZSTD(1)),
    error_count UInt64 CODEC(ZSTD(1)),
    total_count UInt64 CODEC(ZSTD(1)),

    -- Indexes for efficient querying
    INDEX idx_window window_start TYPE minmax GRANULARITY 1,
    INDEX idx_parent parent_service TYPE bloom_filter GRANULARITY 4,
    INDEX idx_child child_service TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (window_start, parent_service, child_service)
SETTINGS index_granularity = 8192,
         ttl_only_drop_parts = 1;

-- Add TTL policies for data retention (30 days for 5min, 90 days for hourly)
ALTER TABLE service_dependencies_5min MODIFY TTL window_start + INTERVAL 30 DAY;
ALTER TABLE service_dependencies_hourly MODIFY TTL window_start + INTERVAL 90 DAY;
