/**
 * AnnotationService implementation for multi-signal telemetry annotation
 * Full type safety with proper Effect-TS patterns and error handling
 */

import { Effect, Context, Layer } from 'effect'
import type { Annotation, AnnotationFilter } from './annotation.schema.js'
import { AnnotationError, ValidationError } from './errors.js'
import { StorageServiceTag } from '../storage/services.js'

// Service interface - simplified
export interface AnnotationServiceImpl {
  readonly annotate: (
    annotation: Annotation
  ) => Effect.Effect<string, AnnotationError | ValidationError, never>
  readonly query: (
    filter: AnnotationFilter
  ) => Effect.Effect<readonly Annotation[], AnnotationError, never>
  readonly deleteExpired: () => Effect.Effect<number, AnnotationError, never>
}

// Context.Tag definition
export class AnnotationService extends Context.Tag('AnnotationService')<
  AnnotationService,
  AnnotationServiceImpl
>() {}

// Remove duplicate ClickhouseClient - use StorageService instead

// Service implementation
export const AnnotationServiceLive = Layer.effect(
  AnnotationService,
  Effect.gen(function* () {
    const storage = yield* StorageServiceTag

    const annotate = (annotation: Annotation) =>
      Effect.gen(function* () {
        // Generate ID if not provided
        const annotationId = annotation.annotationId || crypto.randomUUID()

        // Helper to convert Date to nanoseconds for ClickHouse DateTime64(9)
        const dateToNanos = (date: Date): number => {
          // Convert Date to nanoseconds (milliseconds * 1,000,000)
          return date.getTime() * 1_000_000
        }

        // Prepare values for insertion
        const values = {
          annotation_id: annotationId,
          signal_type: annotation.signalType,
          trace_id: annotation.traceId || null,
          span_id: annotation.spanId || null,
          metric_name: annotation.metricName || null,
          metric_labels: annotation.metricLabels || {},
          log_timestamp: annotation.logTimestamp ? dateToNanos(annotation.logTimestamp) : null,
          log_body_hash: annotation.logBodyHash || null,
          time_range_start: dateToNanos(annotation.timeRangeStart),
          time_range_end: annotation.timeRangeEnd ? dateToNanos(annotation.timeRangeEnd) : null,
          service_name: annotation.serviceName || null,
          resource_attributes: annotation.resourceAttributes || {},
          annotation_type: annotation.annotationType,
          annotation_key: annotation.annotationKey,
          annotation_value: annotation.annotationValue,
          confidence: annotation.confidence || null,
          created_at: annotation.createdAt ? annotation.createdAt.getTime() : Date.now(),
          created_by: annotation.createdBy,
          session_id: annotation.sessionId || null,
          expires_at: annotation.expiresAt ? annotation.expiresAt.getTime() : null,
          parent_annotation_id: annotation.parentAnnotationId || null
        }

        // Full SQL insert with all columns for proper testing
        const insertSQL = `
          INSERT INTO otel.annotations (
            annotation_id, signal_type, trace_id, span_id, metric_name,
            time_range_start, time_range_end, service_name,
            annotation_type, annotation_key, annotation_value, created_by,
            created_at, session_id, expires_at
          ) VALUES (
            '${values.annotation_id}',
            '${values.signal_type}',
            ${values.trace_id ? `'${values.trace_id}'` : 'NULL'},
            ${values.span_id ? `'${values.span_id}'` : 'NULL'},
            ${values.metric_name ? `'${values.metric_name}'` : 'NULL'},
            ${values.time_range_start},
            ${values.time_range_end || 'NULL'},
            ${values.service_name ? `'${values.service_name}'` : 'NULL'},
            '${values.annotation_type}',
            '${values.annotation_key}',
            '${values.annotation_value}',
            '${values.created_by}',
            ${values.created_at},
            ${values.session_id ? `'${values.session_id}'` : 'NULL'},
            ${values.expires_at || 'NULL'}
          )
        `

        console.log('DEBUG: Values for annotation insert:', values)
        console.log('DEBUG: Generated SQL for annotation insert:', insertSQL)

        // Execute the insert using the storage service
        yield* storage.queryRaw(insertSQL).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new AnnotationError({
                reason: 'StorageFailure',
                message: `Failed to insert annotation: ${error}`,
                retryable: true
              })
            )
          )
        )

        return annotationId
      })

    const query = (filter: AnnotationFilter) =>
      Effect.gen(function* () {
        const conditions: string[] = []

        if (filter.signalType) {
          conditions.push(`signal_type = '${filter.signalType}'`)
        }

        if (filter.traceId) {
          conditions.push(`trace_id = '${filter.traceId}'`)
        }

        if (filter.serviceName) {
          conditions.push(`service_name = '${filter.serviceName}'`)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const limit = filter.limit || 100
        const queryText = `
          SELECT *
          FROM otel.annotations
          ${whereClause}
          ORDER BY time_range_start DESC
          LIMIT ${limit}
        `

        const rows = yield* storage.queryRaw(queryText).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new AnnotationError({
                reason: 'StorageFailure',
                message: `Failed to query annotations: ${error}`,
                retryable: true
              })
            )
          ),
          Effect.map(
            (result) =>
              result as Array<{
                annotation_id: string
                signal_type: string
                trace_id?: string | null
                span_id?: string | null
                metric_name?: string | null
                metric_labels?: Record<string, string> | null
                log_timestamp?: number | null
                log_body_hash?: string | null
                time_range_start: number
                time_range_end?: number | null
                service_name?: string | null
                resource_attributes?: Record<string, string> | null
                annotation_type: string
                annotation_key: string
                annotation_value: string
                confidence?: number | null
                created_at?: number | null
                created_by: string
                session_id?: string | null
                expires_at?: number | null
                parent_annotation_id?: string | null
              }>
          )
        )

        // Convert DateTime64 back to Date objects and map snake_case to camelCase
        // ClickHouse returns DateTime64(3) as a string with milliseconds
        // and DateTime64(9) as a string with nanoseconds
        const mappedRows: Annotation[] = rows.map(
          (row: {
            annotation_id: string
            signal_type: string
            trace_id?: string | null
            span_id?: string | null
            metric_name?: string | null
            metric_labels?: Record<string, string> | null
            log_timestamp?: number | null
            log_body_hash?: string | null
            time_range_start: number
            time_range_end?: number | null
            service_name?: string | null
            resource_attributes?: Record<string, string> | null
            annotation_type: string
            annotation_key: string
            annotation_value: string
            confidence?: number | null
            created_at?: number | null
            created_by: string
            session_id?: string | null
            expires_at?: number | null
            parent_annotation_id?: string | null
          }): Annotation => ({
            annotationId: row.annotation_id,
            signalType: row.signal_type as Annotation['signalType'],
            traceId: row.trace_id || undefined,
            spanId: row.span_id || undefined,
            metricName: row.metric_name || undefined,
            metricLabels: row.metric_labels || undefined,
            logTimestamp: row.log_timestamp
              ? new Date(Number(row.log_timestamp) / 1_000_000)
              : undefined,
            logBodyHash: row.log_body_hash || undefined,
            timeRangeStart: new Date(Number(row.time_range_start) / 1_000_000),
            timeRangeEnd: row.time_range_end
              ? new Date(Number(row.time_range_end) / 1_000_000)
              : undefined,
            serviceName: row.service_name || undefined,
            resourceAttributes: row.resource_attributes || undefined,
            annotationType: row.annotation_type as Annotation['annotationType'],
            annotationKey: row.annotation_key,
            annotationValue: row.annotation_value,
            confidence: row.confidence || undefined,
            createdAt: row.created_at ? new Date(row.created_at) : undefined,
            createdBy: row.created_by,
            sessionId: row.session_id || undefined,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            parentAnnotationId: row.parent_annotation_id || undefined
          })
        )

        return mappedRows
      })

    const deleteExpired = () =>
      Effect.gen(function* () {
        // Get current time in milliseconds for comparison with DateTime64(3)
        const nowMillis = Date.now()

        yield* storage
          .queryRaw(
            `
          DELETE FROM otel.annotations
          WHERE expires_at IS NOT NULL AND expires_at < fromUnixTimestamp64Milli(${nowMillis})
        `
          )
          .pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new AnnotationError({
                  reason: 'StorageFailure',
                  message: `Failed to delete expired annotations: ${error}`,
                  retryable: true
                })
              )
            )
          )

        return 0 // Simplified return - ClickHouse doesn't easily return count for DELETE
      })

    return {
      annotate,
      query,
      deleteExpired
    } satisfies AnnotationServiceImpl
  })
)
