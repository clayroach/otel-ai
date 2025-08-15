-- ================================================================
-- AI-Native Observability Platform - ClickHouse Database Setup
-- ================================================================
-- Simple initialization that creates our custom tables
-- OpenTelemetry Collector will create its own tables automatically

-- Create database
CREATE DATABASE IF NOT EXISTS otel;
USE otel;

-- ================================================================
-- Unified Traces Table Schema
-- ================================================================
-- This table combines OpenTelemetry standard fields with AI-friendly
-- computed columns to eliminate the need for separate tables and
-- materialized views.

-- Unified Traces Table
CREATE TABLE IF NOT EXISTS traces_unified (
    -- ============================================================
    -- Standard OpenTelemetry Fields (for OTel Collector compatibility)
    -- ============================================================
    Timestamp DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId String CODEC(ZSTD(1)),
    SpanId String CODEC(ZSTD(1)),
    ParentSpanId String CODEC(ZSTD(1)),
    TraceState String CODEC(ZSTD(1)),
    SpanName LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    SpanAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration UInt64 CODEC(ZSTD(1)),
    StatusCode LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage String CODEC(ZSTD(1)),
    `Events.Timestamp` Array(DateTime64(9)) CODEC(ZSTD(1)),
    `Events.Name` Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `Events.Attributes` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `Links.TraceId` Array(String) CODEC(ZSTD(1)),
    `Links.SpanId` Array(String) CODEC(ZSTD(1)),
    `Links.TraceState` Array(String) CODEC(ZSTD(1)),
    `Links.Attributes` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    
    -- ============================================================
    -- AI-Friendly Computed Columns (for UI and analysis)
    -- ============================================================
    trace_id String ALIAS TraceId,
    span_id String ALIAS SpanId,
    parent_span_id String ALIAS ParentSpanId,
    service_name LowCardinality(String) ALIAS ServiceName,
    operation_name LowCardinality(String) ALIAS SpanName,
    timestamp DateTime64(9) ALIAS Timestamp,
    duration_ms Float64 ALIAS Duration / 1000000,  -- Convert nanoseconds to milliseconds
    status_code LowCardinality(String) ALIAS StatusCode,
    span_kind LowCardinality(String) ALIAS SpanKind,
    is_error UInt8 ALIAS if(StatusCode = 'STATUS_CODE_ERROR', 1, 0),
    attribute_count UInt64 ALIAS length(SpanAttributes),
    ingestion_path LowCardinality(String) DEFAULT 'otlp',
    schema_version LowCardinality(String) DEFAULT 'v1.0'
) ENGINE = MergeTree()
PARTITION BY (ingestion_path, toYYYYMM(Timestamp))
ORDER BY (ingestion_path, ServiceName, Timestamp, TraceId)
TTL Timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_service_operation ON traces_unified (ServiceName, SpanName) TYPE minmax GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_trace_id ON traces_unified (TraceId) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_duration ON traces_unified (Duration) TYPE minmax GRANULARITY 1;

-- ============================================================
-- Queryable View for AI-Friendly Column Names
-- ============================================================
-- This view provides a clean interface for the UI to query traces
-- using computed AI-friendly column names

CREATE OR REPLACE VIEW traces_unified_view AS
SELECT 
    TraceId as trace_id,
    ServiceName as service_name,
    SpanName as operation_name,
    Duration / 1000000 as duration_ms,
    Timestamp as timestamp,
    StatusCode as status_code,
    'otlp' as ingestion_path,
    'v1.0' as schema_version,
    CASE WHEN StatusCode = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END as is_error,
    SpanKind as span_kind,
    ParentSpanId as parent_span_id,
    length(SpanAttributes) as attribute_count,
    SpanId as span_id,
    SpanAttributes as attributes,
    ResourceAttributes as resource_attributes
FROM traces_unified;