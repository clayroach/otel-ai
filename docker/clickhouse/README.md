# ClickHouse Database Setup

This directory contains the ClickHouse configuration for the AI-Native Observability Platform.

## Files

- `config.xml` - ClickHouse server configuration with CORS enabled
- `init-db.sql` - Database initialization script with unified table schema

## Unified Table Architecture

### Core Table: `traces_unified`
A single table that combines OpenTelemetry standard fields with AI-friendly computed columns:

- **OpenTelemetry Fields**: Standard OTLP schema (TraceId, ServiceName, SpanName, etc.)
- **AI-Friendly Columns**: Computed via ALIAS (trace_id, service_name, duration_ms, etc.)
- **No Materialized Views**: Eliminates sync complexity and performance issues

### Queryable View: `traces_unified_view`
A clean interface for UI queries using AI-friendly column names:

```sql
SELECT trace_id, service_name, operation_name, duration_ms, timestamp
FROM otel.traces_unified_view
WHERE timestamp >= subtractHours(now(), 3)
ORDER BY timestamp DESC;
```

## Architecture Benefits

✅ **Single Source of Truth**: One table for all trace data  
✅ **No Sync Issues**: No materialized views to maintain or fall behind  
✅ **Column Efficiency**: ClickHouse column storage benefits preserved  
✅ **Simple Pipeline**: Services → Collector → ClickHouse → UI  
✅ **Easy Maintenance**: Single schema to evolve and debug  

## Data Flow

```
Demo Services / Test Generator
         ↓
   OTel Collector (HTTP/gRPC)
         ↓
   traces_unified table
         ↓
   traces_unified_view
         ↓
      UI Queries
```

## Setup Process

1. **ClickHouse Start**: Container starts and runs `init-db.sql`
2. **Unified Table**: `traces_unified` created with both OTLP and AI-friendly columns
3. **Queryable View**: `traces_unified_view` created for UI compatibility
4. **Indexes**: Performance indexes created for common query patterns
5. **Ready**: System immediately ready for telemetry ingestion

## Testing

Verify the setup with:

```sql
-- Check table creation
SHOW TABLES FROM otel;

-- Check unified table data
SELECT COUNT(*) FROM otel.traces_unified;

-- View recent traces with AI-friendly columns
SELECT service_name, operation_name, duration_ms, timestamp 
FROM otel.traces_unified_view 
ORDER BY timestamp DESC 
LIMIT 10;

-- Test computed columns
SELECT TraceId, trace_id, Duration, duration_ms 
FROM otel.traces_unified 
LIMIT 5;
```

## Migration from Previous Approach

The unified table replaces:
- ❌ `otel_traces` (collector-only table)
- ❌ `ai_traces_unified` (separate AI table)  
- ❌ Materialized views and sync complexity

With:
- ✅ `traces_unified` (unified table with both schemas)
- ✅ `traces_unified_view` (clean query interface)
- ✅ Direct data flow with no sync points

## Current Status

- ✅ **Unified table architecture** eliminating materialized view complexity
- ✅ **Working telemetry pipeline** from demo services to UI
- ✅ **AI-friendly query interface** via computed columns and views
- ✅ **Test data flowing** successfully through unified approach
- ✅ **UI integration** complete with unified table queries