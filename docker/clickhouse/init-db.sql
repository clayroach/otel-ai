-- Initialize ClickHouse for OpenTelemetry data
-- Optimized schemas for AI-native observability platform

-- Create database
CREATE DATABASE IF NOT EXISTS otel;

-- Use the database
USE otel;

-- Traces table optimized for OTel spans
CREATE TABLE IF NOT EXISTS traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    operation_name String,
    start_time DateTime64(9),
    end_time DateTime64(9),
    duration UInt64,
    service_name String,
    service_version String,
    status_code UInt8,
    status_message String,
    span_kind String,
    attributes Map(String, String),
    resource_attributes Map(String, String),
    events Array(Tuple(DateTime64(9), String, Map(String, String))),
    links Array(Tuple(String, String, Map(String, String))),
    -- Indexes for fast queries
    INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_service service_name TYPE set(100) GRANULARITY 1,
    INDEX idx_operation operation_name TYPE set(1000) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, start_time, trace_id)
SETTINGS index_granularity = 8192;

-- Metrics table optimized for OTel metrics
CREATE TABLE IF NOT EXISTS metrics (
    metric_name String,
    timestamp DateTime64(9),
    value Float64,
    metric_type String, -- gauge, counter, histogram, summary
    unit String,
    attributes Map(String, String),
    resource_attributes Map(String, String),
    -- For histogram and summary metrics
    buckets Array(Tuple(Float64, UInt64)), -- bucket boundaries and counts
    quantiles Array(Tuple(Float64, Float64)), -- quantile values
    -- Indexes
    INDEX idx_metric_name metric_name TYPE set(1000) GRANULARITY 1,
    INDEX idx_service resource_attributes['service.name'] TYPE set(100) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (metric_name, timestamp)
SETTINGS index_granularity = 8192;

-- Logs table optimized for OTel logs
CREATE TABLE IF NOT EXISTS logs (
    timestamp DateTime64(9),
    observed_timestamp DateTime64(9),
    severity_text String,
    severity_number UInt8,
    body String,
    trace_id String,
    span_id String,
    attributes Map(String, String),
    resource_attributes Map(String, String),
    -- Indexes
    INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_service resource_attributes['service.name'] TYPE set(100) GRANULARITY 1,
    INDEX idx_body body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (resource_attributes['service.name'], timestamp)
SETTINGS index_granularity = 8192;

-- AI-optimized materialized views for anomaly detection
CREATE MATERIALIZED VIEW IF NOT EXISTS trace_metrics_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, operation_name, toStartOfMinute(start_time))
AS SELECT
    service_name,
    operation_name,
    toStartOfMinute(start_time) as time_bucket,
    count() as request_count,
    avg(duration) as avg_duration,
    quantile(0.95)(duration) as p95_duration,
    quantile(0.99)(duration) as p99_duration,
    countIf(status_code = 2) as error_count
FROM traces
GROUP BY service_name, operation_name, time_bucket;

-- Service dependency graph for AI analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS service_dependencies_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (caller_service, callee_service, toStartOfHour(start_time))
AS SELECT
    resource_attributes['service.name'] as caller_service,
    attributes['rpc.service'] as callee_service,
    toStartOfHour(start_time) as time_bucket,
    count() as call_count,
    avg(duration) as avg_duration
FROM traces
WHERE callee_service != ''
GROUP BY caller_service, callee_service, time_bucket;

-- Grant permissions to otel user
GRANT ALL ON otel.* TO otel;