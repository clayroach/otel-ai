/**
 * Schema definitions for OpenTelemetry data structures
 * Using Effect-TS Schema for runtime validation and type safety
 */

import { Schema } from '@effect/schema'

// Trace data schemas
export const TraceDataSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.optional(Schema.String),
  operationName: Schema.String,
  startTime: Schema.Number, // Unix timestamp in nanoseconds
  endTime: Schema.Number,
  duration: Schema.Number,
  serviceName: Schema.String,
  serviceVersion: Schema.optional(Schema.String),
  statusCode: Schema.Number, // 0=UNSET, 1=OK, 2=ERROR
  statusMessage: Schema.optional(Schema.String),
  spanKind: Schema.String,
  attributes: Schema.Record({ key: Schema.String, value: Schema.String }),
  resourceAttributes: Schema.Record({ key: Schema.String, value: Schema.String }),
  events: Schema.Array(
    Schema.Struct({
      timestamp: Schema.Number,
      name: Schema.String,
      attributes: Schema.Record({ key: Schema.String, value: Schema.String })
    })
  ),
  links: Schema.Array(
    Schema.Struct({
      traceId: Schema.String,
      spanId: Schema.String,
      attributes: Schema.Record({ key: Schema.String, value: Schema.String })
    })
  )
})

// Metric data schemas
export const MetricDataSchema = Schema.Struct({
  metricName: Schema.String,
  timestamp: Schema.Number,
  value: Schema.Number,
  metricType: Schema.Literal('gauge', 'counter', 'histogram', 'summary'),
  unit: Schema.optional(Schema.String),
  attributes: Schema.Record({ key: Schema.String, value: Schema.String }),
  resourceAttributes: Schema.Record({ key: Schema.String, value: Schema.String }),
  // For histogram and summary metrics
  buckets: Schema.optional(
    Schema.Array(
      Schema.Struct({
        boundary: Schema.Number,
        count: Schema.Number
      })
    )
  ),
  quantiles: Schema.optional(
    Schema.Array(
      Schema.Struct({
        quantile: Schema.Number,
        value: Schema.Number
      })
    )
  )
})

// Log data schemas
export const LogDataSchema = Schema.Struct({
  timestamp: Schema.Number,
  observedTimestamp: Schema.Number,
  severityText: Schema.optional(Schema.String),
  severityNumber: Schema.optional(Schema.Number),
  body: Schema.String,
  traceId: Schema.optional(Schema.String),
  spanId: Schema.optional(Schema.String),
  attributes: Schema.Record({ key: Schema.String, value: Schema.String }),
  resourceAttributes: Schema.Record({ key: Schema.String, value: Schema.String })
})

// OTLP data container
export const OTLPDataSchema = Schema.Struct({
  traces: Schema.optional(Schema.Array(TraceDataSchema)),
  metrics: Schema.optional(Schema.Array(MetricDataSchema)),
  logs: Schema.optional(Schema.Array(LogDataSchema)),
  timestamp: Schema.Number
})

// Query parameters for storage operations
export const QueryParamsSchema = Schema.Struct({
  timeRange: Schema.Struct({
    start: Schema.Number,
    end: Schema.Number
  }),
  filters: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
  aggregation: Schema.optional(Schema.String),
  orderBy: Schema.optional(Schema.String),
  orderDirection: Schema.optional(Schema.Literal('ASC', 'DESC'))
})

// AI-specific query parameters for optimized data access
export const AIQueryParamsSchema = Schema.Struct({
  ...QueryParamsSchema.fields,
  datasetType: Schema.Literal('anomaly-detection', 'pattern-recognition', 'forecasting'),
  features: Schema.Array(Schema.String), // Feature columns to extract
  windowSize: Schema.optional(Schema.Number), // Time window for aggregation
  includeContext: Schema.optional(Schema.Boolean) // Include additional context data
})

// Type exports
export type TraceData = Schema.Schema.Type<typeof TraceDataSchema>
export type MetricData = Schema.Schema.Type<typeof MetricDataSchema>
export type LogData = Schema.Schema.Type<typeof LogDataSchema>
export type OTLPData = Schema.Schema.Type<typeof OTLPDataSchema>
export type QueryParams = Schema.Schema.Type<typeof QueryParamsSchema>
export type AIQueryParams = Schema.Schema.Type<typeof AIQueryParamsSchema>

// Dataset for AI analysis
export const AIDatasetSchema = Schema.Struct({
  features: Schema.Array(Schema.Array(Schema.Number)), // Feature matrix
  labels: Schema.optional(Schema.Array(Schema.Number)), // Optional labels
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }), // Additional metadata
  timeRange: Schema.Struct({
    start: Schema.Number,
    end: Schema.Number
  }),
  sampleCount: Schema.Number
})

export type AIDataset = Schema.Schema.Type<typeof AIDatasetSchema>
