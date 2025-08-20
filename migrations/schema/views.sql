-- Simplified Views for Single-Path OTLP Ingestion
-- These views provide convenient access to the unified traces table

-- Main traces view with computed analytics
CREATE OR REPLACE VIEW otel.traces_view AS
SELECT 
    -- Core identifiers
    trace_id,
    span_id,
    parent_span_id,
    
    -- Timing
    start_time,
    end_time,
    duration_ns,
    duration_ms,
    
    -- Service context
    service_name,
    operation_name,
    span_kind,
    
    -- Status
    status_code,
    status_message,
    is_error,
    is_root,
    
    -- OpenTelemetry context
    trace_state,
    scope_name,
    scope_version,
    
    -- Attributes
    span_attributes,
    resource_attributes,
    
    -- Events and links
    events,
    links,
    
    -- Metadata
    ingestion_time,
    processing_version
FROM otel.traces;

-- Service-level aggregation view
CREATE OR REPLACE VIEW otel.service_summary_view AS
SELECT 
    service_name,
    COUNT(*) as span_count,
    COUNT(DISTINCT trace_id) as unique_traces,
    AVG(duration_ms) as avg_duration_ms,
    quantile(0.5)(duration_ms) as p50_duration_ms,
    quantile(0.95)(duration_ms) as p95_duration_ms,
    quantile(0.99)(duration_ms) as p99_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    MIN(duration_ms) as min_duration_ms,
    SUM(is_error) as error_count,
    SUM(is_error) / COUNT(*) as error_rate,
    MAX(start_time) as latest_trace_time,
    MIN(start_time) as earliest_trace_time,
    COUNT(DISTINCT operation_name) as operation_count
FROM otel.traces
WHERE start_time > now() - INTERVAL 1 HOUR
GROUP BY service_name;

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
FROM otel.traces
WHERE start_time > now() - INTERVAL 15 MINUTE
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
    FROM otel.traces
    WHERE start_time > now() - INTERVAL 1 HOUR
        AND start_time < now() - INTERVAL 5 MINUTE
    GROUP BY service_name
    HAVING sample_count >= 100
),
recent_traces AS (
    SELECT 
        trace_id,
        service_name,
        operation_name,
        duration_ms,
        start_time,
        is_error
    FROM otel.traces
    WHERE start_time > now() - INTERVAL 5 MINUTE
)
SELECT 
    rt.trace_id,
    rt.service_name,
    rt.operation_name,
    rt.duration_ms,
    rt.start_time,
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
    FROM otel.traces
    WHERE start_time > now() - INTERVAL 1 HOUR
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