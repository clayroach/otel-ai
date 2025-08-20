-- Unified Views for Dual-Ingestion Architecture
-- These views harmonize data from both collector and direct ingestion paths

-- Main unified view for traces
CREATE OR REPLACE VIEW otel.traces_unified_view AS
SELECT 
    -- Common fields
    TraceId as trace_id,
    SpanId as span_id,
    ParentSpanId as parent_span_id,
    ServiceName as service_name,
    SpanName as operation_name,
    toUnixTimestamp64Nano(Timestamp) as start_time,
    toUnixTimestamp64Nano(Timestamp) + (Duration * 1000) as end_time,
    Duration / 1000000 as duration_ms,
    Timestamp as timestamp,
    toString(StatusCode) as status_code,
    StatusMessage as status_message,
    SpanKind as span_kind,
    
    -- Computed fields
    'collector' as ingestion_path,
    'v1.0' as schema_version,
    CASE 
        WHEN StatusCode = 'STATUS_CODE_ERROR' OR StatusCode = '2' 
        THEN 1 
        ELSE 0 
    END as is_error,
    length(SpanAttributes) as attribute_count,
    
    -- Complex fields
    SpanAttributes as attributes,
    ResourceAttributes as resource_attributes
FROM otel.otel_traces

UNION ALL

SELECT 
    -- Common fields
    trace_id,
    span_id,
    parent_span_id,
    service_name,
    operation_name,
    toUnixTimestamp64Nano(start_time) as start_time,
    toUnixTimestamp64Nano(end_time) as end_time,
    duration / 1000000 as duration_ms,
    start_time as timestamp,
    toString(status_code) as status_code,
    status_message,
    span_kind,
    
    -- Computed fields
    'direct' as ingestion_path,
    'v1.0' as schema_version,
    CASE 
        WHEN status_code = 'STATUS_CODE_ERROR' OR status_code = '2' 
        THEN 1 
        ELSE 0 
    END as is_error,
    length(attributes) as attribute_count,
    
    -- Complex fields
    attributes,
    resource_attributes
FROM otel.ai_traces_direct;

-- Service-level aggregation view
CREATE OR REPLACE VIEW otel.service_summary_view AS
SELECT 
    service_name,
    ingestion_path,
    COUNT(*) as trace_count,
    COUNT(DISTINCT trace_id) as unique_traces,
    AVG(duration_ms) as avg_duration_ms,
    quantile(0.5)(duration_ms) as p50_duration_ms,
    quantile(0.95)(duration_ms) as p95_duration_ms,
    quantile(0.99)(duration_ms) as p99_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    MIN(duration_ms) as min_duration_ms,
    SUM(is_error) as error_count,
    SUM(is_error) / COUNT(*) as error_rate,
    MAX(timestamp) as latest_trace_time,
    MIN(timestamp) as earliest_trace_time
FROM otel.traces_unified_view
WHERE timestamp > now() - INTERVAL 1 HOUR
GROUP BY service_name, ingestion_path;

-- Operation-level performance view
CREATE OR REPLACE VIEW otel.operation_performance_view AS
SELECT 
    service_name,
    operation_name,
    COUNT(*) as call_count,
    AVG(duration_ms) as avg_duration_ms,
    quantile(0.5)(duration_ms) as p50_duration_ms,
    quantile(0.95)(duration_ms) as p95_duration_ms,
    quantile(0.99)(duration_ms) as p99_duration_ms,
    stddevPop(duration_ms) as std_deviation,
    SUM(is_error) as error_count,
    SUM(is_error) / COUNT(*) * 100 as error_percentage
FROM otel.traces_unified_view
WHERE timestamp > now() - INTERVAL 15 MINUTE
GROUP BY service_name, operation_name
HAVING call_count >= 10
ORDER BY service_name, avg_duration_ms DESC;

-- Real-time anomaly detection view
CREATE OR REPLACE VIEW otel.anomaly_candidates_view AS
WITH service_baselines AS (
    SELECT 
        service_name,
        AVG(duration_ms) as baseline_avg,
        stddevPop(duration_ms) as baseline_std,
        COUNT(*) as sample_count
    FROM otel.traces_unified_view
    WHERE timestamp > now() - INTERVAL 1 HOUR
        AND timestamp < now() - INTERVAL 5 MINUTE
    GROUP BY service_name
    HAVING sample_count >= 100
),
recent_traces AS (
    SELECT 
        trace_id,
        service_name,
        operation_name,
        duration_ms,
        timestamp,
        is_error
    FROM otel.traces_unified_view
    WHERE timestamp > now() - INTERVAL 5 MINUTE
)
SELECT 
    rt.trace_id,
    rt.service_name,
    rt.operation_name,
    rt.duration_ms,
    rt.timestamp,
    sb.baseline_avg,
    sb.baseline_std,
    (rt.duration_ms - sb.baseline_avg) / sb.baseline_std as z_score,
    CASE 
        WHEN ABS((rt.duration_ms - sb.baseline_avg) / sb.baseline_std) >= 3 THEN 'high'
        WHEN ABS((rt.duration_ms - sb.baseline_avg) / sb.baseline_std) >= 2 THEN 'medium'
        ELSE 'low'
    END as anomaly_severity,
    rt.is_error
FROM recent_traces rt
JOIN service_baselines sb ON rt.service_name = sb.service_name
WHERE ABS((rt.duration_ms - sb.baseline_avg) / sb.baseline_std) >= 2
ORDER BY ABS(z_score) DESC
LIMIT 100;

-- Service dependency view (experimental)
CREATE OR REPLACE VIEW otel.service_dependencies_view AS
WITH trace_spans AS (
    SELECT 
        trace_id,
        service_name,
        span_id,
        parent_span_id,
        operation_name
    FROM otel.traces_unified_view
    WHERE timestamp > now() - INTERVAL 1 HOUR
)
SELECT 
    t1.service_name as source_service,
    t2.service_name as target_service,
    COUNT(DISTINCT t1.trace_id) as trace_count,
    COUNT(*) as call_count
FROM trace_spans t1
JOIN trace_spans t2 ON t1.span_id = t2.parent_span_id AND t1.trace_id = t2.trace_id
WHERE t1.service_name != t2.service_name
GROUP BY t1.service_name, t2.service_name
ORDER BY call_count DESC;