-- Initial schema migration for AI-Native Observability Platform
-- Migration: 20250819000000_initial_schema

-- Create OTLP traces table (managed by OpenTelemetry Collector)
CREATE TABLE IF NOT EXISTS otel_traces (
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
    Events Nested(
        Timestamp DateTime64(9),
        Name LowCardinality(String),
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    Links Nested(
        TraceId String,
        SpanId String,
        TraceState String,
        Attributes Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    INDEX idx_trace_id TraceId TYPE bloom_filter GRANULARITY 4,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_duration Duration TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toUnixTimestamp(Timestamp), TraceId)
SETTINGS index_granularity = 8192,
         ttl_only_drop_parts = 1;

-- Create direct ingestion traces table
CREATE TABLE IF NOT EXISTS ai_traces_direct (
    trace_id String,
    span_id String,
    parent_span_id String,
    operation_name LowCardinality(String),
    start_time DateTime64(9),
    end_time DateTime64(9),
    duration UInt64,
    service_name LowCardinality(String),
    status_code LowCardinality(String),
    status_message String DEFAULT '',
    span_kind LowCardinality(String),
    attributes Map(String, String),
    resource_attributes Map(String, String),
    ingestion_time DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, toUnixTimestamp(start_time), trace_id)
SETTINGS index_granularity = 8192;

-- Create anomaly detection table
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

-- Create service baselines table
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