-- ================================================================
-- AI-Native Observability Platform - ClickHouse Database Setup
-- ================================================================
-- Simple initialization that creates our custom tables
-- OpenTelemetry Collector will create its own tables automatically

-- Create database
CREATE DATABASE IF NOT EXISTS otel;
USE otel;

-- ================================================================
-- Custom Tables for Direct Ingestion
-- ================================================================

-- Custom Traces Table (AI-Optimized Schema)
CREATE TABLE IF NOT EXISTS traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    operation_name LowCardinality(String),
    start_time DateTime64(9),
    end_time DateTime64(9),
    duration UInt64,
    service_name LowCardinality(String),
    service_version LowCardinality(String),
    status_code UInt8,
    status_message String,
    span_kind LowCardinality(String),
    attributes Map(String, String),
    resource_attributes Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, start_time, trace_id)
TTL start_time + INTERVAL 30 DAY;

-- ================================================================
-- AI-Unified Analysis Table
-- ================================================================

-- Unified Traces Table for Cross-Path Analysis
CREATE TABLE IF NOT EXISTS ai_traces_unified (
    trace_id String,
    service_name LowCardinality(String),
    operation_name LowCardinality(String),
    duration_ms Float64,
    timestamp DateTime64(9),
    status_code LowCardinality(String),
    ingestion_path LowCardinality(String),
    schema_version LowCardinality(String),
    is_error UInt8,
    span_kind LowCardinality(String),
    parent_span_id String,
    attribute_count UInt64 DEFAULT 0
) ENGINE = MergeTree()
PARTITION BY (ingestion_path, toYYYYMM(timestamp))
ORDER BY (ingestion_path, service_name, timestamp, trace_id)
TTL timestamp + INTERVAL 30 DAY;