-- ClickHouse Native Memory Monitoring for Query OOM Prevention
-- This approach uses ClickHouse's built-in system.query_log to track memory per query
-- Much simpler than our custom QueryValidator pattern detection

-- 1. Real-time monitoring of high-memory queries
WITH recent_queries AS (
    SELECT
        event_time,
        query_id,
        type,
        query_duration_ms,
        memory_usage / (1024*1024) as memory_mb,
        read_rows,
        read_bytes / (1024*1024*1024) as read_gb,
        query,
        exception,
        current_database,
        user,
        -- Extract query pattern for grouping
        CASE
            WHEN query LIKE '%JOIN%traces%traces%' THEN 'SELF_JOIN'
            WHEN query LIKE '%CROSS JOIN%' THEN 'CROSS_JOIN'
            WHEN query LIKE '%WITH%AS%SELECT%' THEN 'CTE_QUERY'
            WHEN query LIKE '%GROUP BY%' THEN 'AGGREGATION'
            WHEN query LIKE '%arrayJoin%' THEN 'ARRAY_JOIN'
            ELSE 'OTHER'
        END as query_pattern
    FROM system.query_log
    WHERE event_date >= today()
        AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
        AND query NOT LIKE '%system.%'
)
SELECT
    query_pattern,
    COUNT(*) as query_count,
    AVG(memory_mb) as avg_memory_mb,
    MAX(memory_mb) as max_memory_mb,
    quantile(0.95)(memory_mb) as p95_memory_mb,
    AVG(query_duration_ms) as avg_duration_ms,
    SUM(CASE WHEN exception != '' THEN 1 ELSE 0 END) as failed_queries,
    -- Flag high-risk patterns
    CASE
        WHEN MAX(memory_mb) > 500 THEN 'CRITICAL'
        WHEN MAX(memory_mb) > 200 THEN 'HIGH'
        WHEN MAX(memory_mb) > 100 THEN 'MEDIUM'
        ELSE 'LOW'
    END as risk_level
FROM recent_queries
GROUP BY query_pattern
ORDER BY max_memory_mb DESC;

-- 2. Identify specific problematic queries
SELECT
    formatDateTime(event_time, '%H:%i:%S') as time,
    query_duration_ms,
    round(memory_usage / (1024*1024), 2) as memory_mb,
    formatReadableQuantity(read_rows) as rows_read,
    substring(query, 1, 200) as query_preview,
    CASE
        WHEN memory_usage > 500 * 1024 * 1024 THEN '🚨 CRITICAL'
        WHEN memory_usage > 200 * 1024 * 1024 THEN '⚠️  HIGH'
        WHEN memory_usage > 100 * 1024 * 1024 THEN '🟡 MEDIUM'
        ELSE '✅ OK'
    END as memory_risk,
    exception
FROM system.query_log
WHERE event_date = today()
    AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
    AND memory_usage > 50 * 1024 * 1024  -- Only queries using >50MB
    AND query NOT LIKE '%system.%'
ORDER BY memory_usage DESC
LIMIT 20;

-- 3. Memory usage trends over time (for alerting)
SELECT
    toStartOfMinute(event_time) as minute,
    COUNT(*) as queries,
    MAX(memory_usage / (1024*1024)) as peak_memory_mb,
    AVG(memory_usage / (1024*1024)) as avg_memory_mb,
    SUM(CASE WHEN memory_usage > 100*1024*1024 THEN 1 ELSE 0 END) as high_memory_queries
FROM system.query_log
WHERE event_time >= now() - INTERVAL 1 HOUR
    AND type = 'QueryFinish'
    AND query NOT LIKE '%system.%'
GROUP BY minute
ORDER BY minute DESC
LIMIT 60;

-- 4. Create materialized view for continuous monitoring
-- This automatically tracks high-memory queries in real-time
CREATE MATERIALIZED VIEW IF NOT EXISTS query_memory_monitoring
ENGINE = MergeTree()
ORDER BY (event_time, memory_mb)
AS SELECT
    event_time,
    query_id,
    user,
    query_duration_ms,
    memory_usage / (1024*1024) as memory_mb,
    read_rows,
    read_bytes / (1024*1024*1024) as read_gb,
    -- Pattern detection
    CASE
        WHEN query LIKE '%JOIN%traces%traces%' THEN 'SELF_JOIN'
        WHEN query LIKE '%CROSS JOIN%' THEN 'CROSS_JOIN'
        WHEN query LIKE '%GROUP BY%,%,%,%,%' THEN 'COMPLEX_AGGREGATION'
        WHEN query LIKE '%SELECT%SELECT%' THEN 'NESTED_SUBQUERY'
        ELSE 'STANDARD'
    END as pattern,
    substring(query, 1, 500) as query_preview,
    exception
FROM system.query_log
WHERE type = 'QueryFinish'
    AND memory_usage > 50 * 1024 * 1024  -- Track queries >50MB
    AND query NOT LIKE '%system.%';

-- 5. Alert query - run periodically to check for OOM risk
-- This could be integrated with alertmanager or other monitoring
SELECT
    'ALERT' as alert_type,
    now() as check_time,
    COUNT(*) as high_mem_queries_last_5min,
    MAX(memory_usage / (1024*1024)) as max_memory_mb,
    CASE
        WHEN MAX(memory_usage) > 1000 * 1024 * 1024 THEN 'CRITICAL: Queries using >1GB memory detected!'
        WHEN MAX(memory_usage) > 500 * 1024 * 1024 THEN 'WARNING: Queries using >500MB memory'
        WHEN COUNT(*) > 10 THEN 'WARNING: Many high-memory queries'
        ELSE 'OK'
    END as alert_message
FROM system.query_log
WHERE event_time >= now() - INTERVAL 5 MINUTE
    AND type = 'QueryFinish'
    AND memory_usage > 100 * 1024 * 1024  -- Queries using >100MB
    AND query NOT LIKE '%system.%';

-- 6. OpenTelemetry integration check
-- See if we have trace context for queries
SELECT
    COUNT(*) as total_queries,
    SUM(CASE WHEN opentelemetry_trace_id != '' THEN 1 ELSE 0 END) as traced_queries,
    SUM(CASE WHEN opentelemetry_span_id != '' THEN 1 ELSE 0 END) as with_spans
FROM system.query_log
WHERE event_date = today()
    AND type = 'QueryFinish'
LIMIT 1;