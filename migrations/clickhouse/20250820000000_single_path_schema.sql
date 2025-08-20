-- Single-Path OTLP Ingestion Schema Migration
-- Migration: 20250820000000_single_path_schema
-- Simplifies architecture to single ingestion path through backend service

-- Main traces table optimized for AI processing
CREATE TABLE IF NOT EXISTS traces (
    -- Core trace identifiers
    trace_id String CODEC(ZSTD(1)),
    span_id String CODEC(ZSTD(1)),
    parent_span_id String CODEC(ZSTD(1)),
    
    -- Timing information
    start_time DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    end_time DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    duration_ns UInt64 CODEC(ZSTD(1)),
    
    -- Service and operation context
    service_name LowCardinality(String) CODEC(ZSTD(1)),
    operation_name LowCardinality(String) CODEC(ZSTD(1)),
    span_kind LowCardinality(String) CODEC(ZSTD(1)),
    
    -- Status information
    status_code LowCardinality(String) CODEC(ZSTD(1)),
    status_message String CODEC(ZSTD(1)),
    
    -- OpenTelemetry context
    trace_state String CODEC(ZSTD(1)),
    scope_name String CODEC(ZSTD(1)),
    scope_version String CODEC(ZSTD(1)),
    
    -- Attributes (flattened for AI processing)
    span_attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    resource_attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    
    -- Events and links (JSON for flexibility)
    events String CODEC(ZSTD(1)),
    links String CODEC(ZSTD(1)),
    
    -- AI processing metadata
    ingestion_time DateTime64(3) DEFAULT now64(3),
    processing_version UInt8 DEFAULT 1,
    
    -- Computed fields for analytics
    duration_ms Float64 MATERIALIZED duration_ns / 1000000,
    is_error UInt8 MATERIALIZED CASE 
        WHEN status_code IN ('STATUS_CODE_ERROR', 'ERROR', '2') THEN 1 
        ELSE 0 
    END,
    is_root UInt8 MATERIALIZED CASE 
        WHEN parent_span_id = '' OR parent_span_id IS NULL THEN 1 
        ELSE 0 
    END,
    
    -- Indexes for efficient querying
    INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_service service_name TYPE bloom_filter GRANULARITY 4,
    INDEX idx_operation operation_name TYPE bloom_filter GRANULARITY 4,
    INDEX idx_status status_code TYPE bloom_filter GRANULARITY 4,
    INDEX idx_duration duration_ns TYPE minmax GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(resource_attributes) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_span_attr_key mapKeys(span_attributes) TYPE bloom_filter GRANULARITY 4
    
) ENGINE = MergeTree()
PARTITION BY toDate(start_time)
ORDER BY (service_name, operation_name, toUnixTimestamp(start_time), trace_id)
SETTINGS index_granularity = 8192,
         ttl_only_drop_parts = 1;

-- Create anomaly detection table (unchanged)
CREATE TABLE IF NOT EXISTS ai_anomalies (
    anomaly_id UUID DEFAULT generateUUIDv4(),
    detected_at DateTime64(3) DEFAULT now64(3),
    trace_id String,
    service_name LowCardinality(String),
    operation_name LowCardinality(String),
    anomaly_type LowCardinality(String),
    severity LowCardinality(String),
    z_score Float64,
    expected_value Float64,
    actual_value Float64,
    metadata Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(detected_at)
ORDER BY (detected_at, service_name, anomaly_id)
SETTINGS index_granularity = 8192;

-- Create service baselines table (unchanged)
CREATE TABLE IF NOT EXISTS ai_service_baselines (
    service_name LowCardinality(String),
    operation_name LowCardinality(String),
    metric_name LowCardinality(String),
    baseline_window LowCardinality(String),
    calculated_at DateTime64(3),
    mean_value Float64,
    std_deviation Float64,
    p50 Float64,
    p95 Float64,
    p99 Float64,
    sample_count UInt64,
    version UInt64 DEFAULT 1
) ENGINE = ReplacingMergeTree(version)
ORDER BY (service_name, operation_name, metric_name, baseline_window)
SETTINGS index_granularity = 8192;