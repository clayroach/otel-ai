/**
 * Schema definitions for the universal annotation system
 * Supports traces, metrics, logs, and future signal types
 */

import { Schema } from '@effect/schema'

// Signal types that can be annotated
export const SignalTypeSchema = Schema.Literal('trace', 'metric', 'log', 'any')
export type SignalType = Schema.Schema.Type<typeof SignalTypeSchema>

// Annotation type with enforced prefixes
export const AnnotationTypeSchema = Schema.Literal('test', 'diag', 'human', 'llm', 'meta', 'train')
export type AnnotationType = Schema.Schema.Type<typeof AnnotationTypeSchema>

// Time range for annotations
export const TimeRangeSchema = Schema.Struct({
  start: Schema.Date,
  end: Schema.optional(Schema.Date)
})
export type TimeRange = Schema.Schema.Type<typeof TimeRangeSchema>

// Main annotation schema
export const AnnotationSchema = Schema.Struct({
  annotationId: Schema.optional(Schema.String),

  // Signal targeting
  signalType: SignalTypeSchema,

  // Signal-specific references (all optional)
  traceId: Schema.optional(Schema.String),
  spanId: Schema.optional(Schema.String),
  metricName: Schema.optional(Schema.String),
  metricLabels: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  logTimestamp: Schema.optional(Schema.Date),
  logBodyHash: Schema.optional(Schema.String),

  // Time range (required for all)
  timeRangeStart: Schema.Date,
  timeRangeEnd: Schema.optional(Schema.Date),

  // Service/resource targeting
  serviceName: Schema.optional(Schema.String),
  resourceAttributes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),

  // Annotation content
  annotationType: AnnotationTypeSchema,
  annotationKey: Schema.String.pipe(
    Schema.filter(
      (key) => {
        // Validate key starts with correct prefix
        const prefixes = ['test.', 'diag.', 'human.', 'llm.', 'meta.', 'train.']
        return prefixes.some((p) => key.startsWith(p))
      },
      {
        message: () =>
          'Annotation key must start with valid prefix (test., diag., human., llm., meta., train.)'
      }
    )
  ),
  annotationValue: Schema.String, // JSON encoded
  confidence: Schema.optional(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(0), Schema.lessThanOrEqualTo(1))
  ),

  // Metadata
  createdAt: Schema.optional(Schema.Date),
  createdBy: Schema.String,
  sessionId: Schema.optional(Schema.String),
  expiresAt: Schema.optional(Schema.Date),
  parentAnnotationId: Schema.optional(Schema.String)
})
export type Annotation = Schema.Schema.Type<typeof AnnotationSchema>

// Filter for querying annotations
export const AnnotationFilterSchema = Schema.Struct({
  signalType: Schema.optional(SignalTypeSchema),
  traceId: Schema.optional(Schema.String),
  metricName: Schema.optional(Schema.String),
  serviceName: Schema.optional(Schema.String),
  annotationType: Schema.optional(AnnotationTypeSchema),
  timeRange: Schema.optional(TimeRangeSchema),
  sessionId: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number)
})
export type AnnotationFilter = Schema.Schema.Type<typeof AnnotationFilterSchema>

// Validation result for anti-contamination
export const ValidationResultSchema = Schema.Struct({
  isValid: Schema.Boolean,
  errors: Schema.Array(
    Schema.Struct({
      field: Schema.String,
      message: Schema.String,
      severity: Schema.Literal('error', 'warning')
    })
  ),
  prohibitedPrefixes: Schema.Array(Schema.String)
})
export type ValidationResult = Schema.Schema.Type<typeof ValidationResultSchema>
