# ClickHouse Schema Definition for AI-Native Observability Platform
# Single source of truth for all database schemas

schema "otel" {
  charset = "utf8"
  collate = "utf8_general_ci"
}

# ============================================================================
# OTLP Collector Tables - Managed by OpenTelemetry Collector
# ============================================================================

table "otel_traces" {
  schema = schema.otel
  engine = "MergeTree"
  
  column "Timestamp" {
    type = "DateTime64(9)"
    null = false
  }
  
  column "TraceId" {
    type = "String"
    null = false
  }
  
  column "SpanId" {
    type = "String"
    null = false
  }
  
  column "ParentSpanId" {
    type = "String"
    null = false
  }
  
  column "TraceState" {
    type = "String"
    null = false
  }
  
  column "SpanName" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "SpanKind" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "ServiceName" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "ResourceAttributes" {
    type = "Map(LowCardinality(String), String)"
    null = false
  }
  
  column "ScopeName" {
    type = "String"
    null = false
  }
  
  column "ScopeVersion" {
    type = "String"
    null = false
  }
  
  column "SpanAttributes" {
    type = "Map(LowCardinality(String), String)"
    null = false
  }
  
  column "Duration" {
    type = "UInt64"
    null = false
  }
  
  column "StatusCode" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "StatusMessage" {
    type = "String"
    null = false
  }
  
  column "Events" {
    type = "Nested(Timestamp DateTime64(9), Name LowCardinality(String), Attributes Map(LowCardinality(String), String))"
    null = false
  }
  
  column "Links" {
    type = "Nested(TraceId String, SpanId String, TraceState String, Attributes Map(LowCardinality(String), String))"
    null = false
  }
  
  primary_key {
    columns = ["ServiceName", "SpanName", "toUnixTimestamp(Timestamp)", "TraceId"]
  }
  
  index "idx_trace_id" {
    type = "bloom_filter"
    columns = ["TraceId"]
  }
  
  index "idx_res_attr_key" {
    type = "bloom_filter"
    columns = ["mapKeys(ResourceAttributes)"]
  }
  
  index "idx_res_attr_value" {
    type = "bloom_filter"
    columns = ["mapValues(ResourceAttributes)"]
  }
  
  index "idx_span_attr_key" {
    type = "bloom_filter"
    columns = ["mapKeys(SpanAttributes)"]
  }
  
  index "idx_span_attr_value" {
    type = "bloom_filter"
    columns = ["mapValues(SpanAttributes)"]
  }
  
  index "idx_duration" {
    type = "minmax"
    columns = ["Duration"]
  }
  
  partition {
    by = "toDate(Timestamp)"
  }
  
  order {
    by = ["ServiceName", "SpanName", "toUnixTimestamp(Timestamp)", "TraceId"]
  }
  
  settings {
    index_granularity = 8192
    ttl = "Timestamp + INTERVAL 30 DAY"
  }
}

# ============================================================================
# Direct Ingestion Tables - For AI-optimized telemetry
# ============================================================================

table "ai_traces_direct" {
  schema = schema.otel
  engine = "MergeTree"
  
  column "trace_id" {
    type = "String"
    null = false
  }
  
  column "span_id" {
    type = "String"
    null = false
  }
  
  column "parent_span_id" {
    type = "String"
    null = false
  }
  
  column "operation_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "start_time" {
    type = "DateTime64(9)"
    null = false
  }
  
  column "end_time" {
    type = "DateTime64(9)"
    null = false
  }
  
  column "duration" {
    type = "UInt64"
    null = false
  }
  
  column "service_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "status_code" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "status_message" {
    type = "String"
    null = false
    default = "''"
  }
  
  column "span_kind" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "attributes" {
    type = "Map(String, String)"
    null = false
  }
  
  column "resource_attributes" {
    type = "Map(String, String)"
    null = false
  }
  
  column "ingestion_time" {
    type = "DateTime64(3)"
    null = false
    default = "now64(3)"
  }
  
  primary_key {
    columns = ["service_name", "toUnixTimestamp(start_time)", "trace_id"]
  }
  
  partition {
    by = "toYYYYMM(start_time)"
  }
  
  order {
    by = ["service_name", "toUnixTimestamp(start_time)", "trace_id"]
  }
  
  settings {
    index_granularity = 8192
    ttl = "start_time + INTERVAL 30 DAY"
  }
}

# ============================================================================
# AI/ML Tables - For anomaly detection and pattern recognition
# ============================================================================

table "ai_anomalies" {
  schema = schema.otel
  engine = "MergeTree"
  
  column "anomaly_id" {
    type = "UUID"
    null = false
    default = "generateUUIDv4()"
  }
  
  column "detected_at" {
    type = "DateTime64(3)"
    null = false
    default = "now64(3)"
  }
  
  column "trace_id" {
    type = "String"
    null = false
  }
  
  column "service_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "operation_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "anomaly_type" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "severity" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "z_score" {
    type = "Float64"
    null = false
  }
  
  column "expected_value" {
    type = "Float64"
    null = false
  }
  
  column "actual_value" {
    type = "Float64"
    null = false
  }
  
  column "metadata" {
    type = "Map(String, String)"
    null = false
  }
  
  primary_key {
    columns = ["detected_at", "service_name", "anomaly_id"]
  }
  
  partition {
    by = "toYYYYMM(detected_at)"
  }
  
  order {
    by = ["detected_at", "service_name", "anomaly_id"]
  }
  
  settings {
    index_granularity = 8192
    ttl = "detected_at + INTERVAL 90 DAY"
  }
}

table "ai_service_baselines" {
  schema = schema.otel
  engine = "ReplacingMergeTree"
  
  column "service_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "operation_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "metric_name" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "baseline_window" {
    type = "LowCardinality(String)"
    null = false
  }
  
  column "calculated_at" {
    type = "DateTime64(3)"
    null = false
  }
  
  column "mean_value" {
    type = "Float64"
    null = false
  }
  
  column "std_deviation" {
    type = "Float64"
    null = false
  }
  
  column "p50" {
    type = "Float64"
    null = false
  }
  
  column "p95" {
    type = "Float64"
    null = false
  }
  
  column "p99" {
    type = "Float64"
    null = false
  }
  
  column "sample_count" {
    type = "UInt64"
    null = false
  }
  
  column "version" {
    type = "UInt64"
    null = false
    default = "1"
  }
  
  primary_key {
    columns = ["service_name", "operation_name", "metric_name", "baseline_window"]
  }
  
  order {
    by = ["service_name", "operation_name", "metric_name", "baseline_window"]
  }
  
  version_column = "version"
  
  settings {
    index_granularity = 8192
  }
}

# ============================================================================
# Metric Tables - OpenTelemetry Metrics
# ============================================================================

table "otel_metrics_sum" {
  schema = schema.otel
  engine = "MergeTree"
  
  column "ResourceAttributes" {
    type = "Map(LowCardinality(String), String)"
    null = false
  }
  
  column "ResourceSchemaUrl" {
    type = "String"
    null = false
  }
  
  column "ScopeName" {
    type = "String"
    null = false
  }
  
  column "ScopeVersion" {
    type = "String"
    null = false
  }
  
  column "ScopeAttributes" {
    type = "Map(LowCardinality(String), String)"
    null = false
  }
  
  column "ScopeSchemaUrl" {
    type = "String"
    null = false
  }
  
  column "MetricName" {
    type = "String"
    null = false
  }
  
  column "MetricDescription" {
    type = "String"
    null = false
  }
  
  column "MetricUnit" {
    type = "String"
    null = false
  }
  
  column "Attributes" {
    type = "Map(LowCardinality(String), String)"
    null = false
  }
  
  column "StartTimeUnix" {
    type = "DateTime64(9)"
    null = false
  }
  
  column "TimeUnix" {
    type = "DateTime64(9)"
    null = false
  }
  
  column "Value" {
    type = "Float64"
    null = false
  }
  
  column "Flags" {
    type = "UInt32"
    null = false
  }
  
  column "Exemplars" {
    type = "Nested(FilteredAttributes Map(LowCardinality(String), String), TimeUnix DateTime64(9), Value Float64, SpanId String, TraceId String)"
    null = false
  }
  
  column "AggregationTemporality" {
    type = "Int32"
    null = false
  }
  
  column "IsMonotonic" {
    type = "Bool"
    null = false
  }
  
  primary_key {
    columns = ["MetricName", "Attributes", "TimeUnix"]
  }
  
  partition {
    by = "toDate(TimeUnix)"
  }
  
  order {
    by = ["MetricName", "Attributes", "TimeUnix"]
  }
  
  settings {
    index_granularity = 8192
    ttl = "TimeUnix + INTERVAL 30 DAY"
  }
}