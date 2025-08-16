-- ================================================================
-- AI-Native Observability Platform - ClickHouse Database Setup
-- ================================================================
-- Simple initialization that creates our custom tables
-- OpenTelemetry Collector will create its own tables automatically

-- Create database
CREATE DATABASE IF NOT EXISTS otel;
USE otel;

-- ================================================================
-- AI-Friendly Views for Dual Ingestion Paths
-- ================================================================
-- The OpenTelemetry Collector creates otel_traces with standard schema
-- We also support direct ingestion to ai_traces_direct for testing
-- Both paths are unified in traces_unified_view for the UI

-- Direct ingestion table for test generator (bypasses collector)
CREATE TABLE IF NOT EXISTS ai_traces_direct (
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
ORDER BY (service_name, start_time, trace_id);

-- ============================================================
-- Unified View - Created Later After OTel Collector Starts
-- ============================================================
-- The unified view will be created by the backend service after
-- the OTel Collector has created the otel_traces table