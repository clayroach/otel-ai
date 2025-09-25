-- Feature-005b: Universal Annotation System for all OTLP signals
-- Supports traces, metrics, logs, and future signal types
-- Migration: 20250924000001_create_annotations_table

-- Create annotations table for multi-signal telemetry metadata
CREATE TABLE IF NOT EXISTS annotations (
    -- Core identity
    annotation_id String DEFAULT generateUUIDv4(),

    -- Universal signal targeting
    signal_type LowCardinality(String), -- 'trace', 'metric', 'log', 'any'

    -- Signal-specific references (all nullable for flexibility)
    trace_id Nullable(String),
    span_id Nullable(String),
    metric_name Nullable(String),
    metric_labels Map(LowCardinality(String), String) DEFAULT map(),
    log_timestamp Nullable(DateTime64(9)),
    log_body_hash Nullable(String),

    -- Time-range targeting (works for all signals)
    time_range_start DateTime64(9),
    time_range_end Nullable(DateTime64(9)),

    -- Service/resource targeting
    service_name Nullable(String),
    resource_attributes Map(LowCardinality(String), String) DEFAULT map(),

    -- Annotation content with prefix validation
    annotation_type LowCardinality(String), -- 'test', 'diag', 'human', 'llm', 'meta', 'train'
    annotation_key String, -- Must start with type prefix (e.g., 'test.flag.payment_failure')
    annotation_value String, -- JSON encoded value
    confidence Nullable(Float32),

    -- Metadata and audit trail
    created_at DateTime64(3) DEFAULT now64(3),
    created_by String,
    session_id Nullable(String),
    expires_at Nullable(DateTime64(3)),
    parent_annotation_id Nullable(String),

    -- Performance indexes for efficient querying
    INDEX idx_signal signal_type TYPE set(10) GRANULARITY 1,
    INDEX idx_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_metric metric_name TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_time_start time_range_start TYPE minmax GRANULARITY 1,
    INDEX idx_service service_name TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_type annotation_type TYPE set(10) GRANULARITY 1,
    INDEX idx_session session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_key_prefix annotation_key TYPE ngrambf_v1(3, 256, 2, 0) GRANULARITY 1

) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time_range_start)
ORDER BY (signal_type, annotation_type, time_range_start, annotation_id)
SETTINGS index_granularity = 8192;

-- Create view for trace annotations
CREATE VIEW IF NOT EXISTS trace_annotations AS
SELECT * FROM annotations
WHERE signal_type = 'trace' AND trace_id IS NOT NULL;

-- Create view for metric annotations
CREATE VIEW IF NOT EXISTS metric_annotations AS
SELECT * FROM annotations
WHERE signal_type = 'metric' AND metric_name IS NOT NULL;

-- Create view for log annotations
CREATE VIEW IF NOT EXISTS log_annotations AS
SELECT * FROM annotations
WHERE signal_type = 'log' AND log_timestamp IS NOT NULL;

-- Create view for prohibited training annotations (anti-contamination)
CREATE VIEW IF NOT EXISTS prohibited_training_annotations AS
SELECT * FROM annotations
WHERE annotation_type IN ('test', 'train');