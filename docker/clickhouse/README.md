# ClickHouse Database Setup

This directory contains the ClickHouse configuration for the AI-Native Observability Platform.

## Files

- `config.xml` - ClickHouse server configuration with CORS enabled
- `init-db.sql` - Database initialization script that creates custom tables

## Database Schema

### Automatic Tables (Created by OpenTelemetry Collector)
- `otel_traces` - Standard OTLP traces from the collector
- `otel_metrics_*` - Various metrics tables  
- `otel_logs` - Standard OTLP logs

### Custom Tables (Created by init script)
- `traces` - Custom traces table for direct ingestion
- `ai_traces_unified` - Unified table combining data from both ingestion paths

## Setup Process

1. **ClickHouse Start**: ClickHouse container starts and runs init-db.sql
2. **Custom Tables**: Our custom tables are created immediately
3. **Collector Tables**: OpenTelemetry Collector creates its tables when it starts ingesting data
4. **Materialized Views**: Created manually after collector tables exist (see Post-Setup)

## Post-Setup: Create Materialized Views

After the OpenTelemetry Collector has created the `otel_traces` table, create the materialized view:

```sql
USE otel;
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_traces_unified_otlp_mv
TO ai_traces_unified
AS SELECT
    TraceId as trace_id,
    ServiceName as service_name,
    SpanName as operation_name,
    Duration / 1000000.0 as duration_ms,
    Timestamp as timestamp,
    StatusCode as status_code,
    'collector' as ingestion_path,
    'otlp' as schema_version,
    if(StatusCode = 'ERROR', 1, 0) as is_error,
    SpanKind as span_kind,
    ParentSpanId as parent_span_id,
    length(SpanAttributes) as attribute_count
FROM otel.otel_traces;
```

## Testing

Verify the setup with:

```sql
-- Check table creation
SHOW TABLES FROM otel;

-- Check unified table data
SELECT COUNT(*) FROM otel.ai_traces_unified;

-- View recent traces
SELECT service_name, operation_name, duration_ms, timestamp 
FROM otel.ai_traces_unified 
ORDER BY timestamp DESC 
LIMIT 10;
```

## Current Status

- ✅ **Simple, reliable setup** using standard ClickHouse initialization
- ✅ **Automatic table creation** via init script
- ✅ **Working materialized views** for unified data processing  
- ✅ **UI integration** with all required columns
- ✅ **Test data generation** flowing through both paths

Note: Advanced schema migration tools like Atlas can be added later as a separate improvement.