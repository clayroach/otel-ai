/**
 * Unit tests for annotation service using ClickHouse test container
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'
import {
  AnnotationService,
  AnnotationServiceLive
} from '../../annotation-service.js'
import { StorageServiceTag, type StorageService } from '../../../storage/services.js'
import { AnnotationSchema, type Annotation } from '../../annotation.schema.js'
import {
  type ClickHouseTestContainer,
  startClickHouseContainer,
  setupAnnotationsSchema,
  cleanupClickHouseContainer,
  clearTestData
} from '../test-utils/clickhouse-container.js'

describe('AnnotationService with TestContainer', () => {
  let testContainer: ClickHouseTestContainer
  let serviceLayer: Layer.Layer<AnnotationService, never, never>

  beforeAll(async () => {
    try {
      // Start ClickHouse container
      testContainer = await startClickHouseContainer()

      // Set up the annotations schema
      await setupAnnotationsSchema(testContainer.client)

      // Create the service layer with storage service wrapping the test ClickHouse client
      const storageService: StorageService = {
        writeOTLP: () => Effect.succeed(undefined),
        writeBatch: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryForAI: () => Effect.succeed({
          features: [],
          labels: [],
          metadata: {},
          timeRange: { start: 0, end: 0 },
          sampleCount: 0
        }),
        queryRaw: (sql: string) => Effect.tryPromise({
          try: async () => {
            if (sql.includes('INSERT INTO') || sql.includes('DELETE FROM')) {
              // For INSERT/DELETE operations, execute as command and return empty array
              await testContainer.client.command({ query: sql })
              return []
            } else {
              // For SELECT operations, return the JSON result as an array
              const result = await testContainer.client.query({ query: sql })
              const jsonResult = await result.json()

              // ClickHouse can return different formats. Handle various cases:
              if (Array.isArray(jsonResult)) {
                return jsonResult
              } else if (jsonResult && typeof jsonResult === 'object' && 'data' in jsonResult) {
                // Some ClickHouse formats return {data: [...]}
                return Array.isArray(jsonResult.data) ? jsonResult.data : []
              } else if (jsonResult && typeof jsonResult === 'object' && 'rows' in jsonResult) {
                // Some formats return {rows: [...]}
                const rowsResult = jsonResult as { rows: unknown }
                return Array.isArray(rowsResult.rows) ? rowsResult.rows : []
              } else {
                // Fallback: try to convert single objects to arrays
                return jsonResult ? [jsonResult] : []
              }
            }
          },
          catch: (error) => {
            return { _tag: 'QueryError' as const, message: String(error), query: sql.slice(0, 100), cause: error }
          }
        }),
        queryText: (sql: string) => Effect.tryPromise({
          try: () => testContainer.client.query({ query: sql }).then(result => result.text()),
          catch: (error) => ({ _tag: 'QueryError' as const, message: String(error), query: sql, cause: error })
        }),
        archiveData: () => Effect.succeed(undefined),
        applyRetentionPolicies: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true }),
        getStorageStats: () => Effect.succeed({
          clickhouse: { totalTraces: 0, totalMetrics: 0, totalLogs: 0, diskUsage: '0 GB' },
          s3: { totalObjects: 0, totalSize: '0 GB', oldestObject: null, newestObject: null }
        })
      }

      const storageLayer = Layer.succeed(StorageServiceTag, storageService)
      serviceLayer = Layer.provide(AnnotationServiceLive, storageLayer)
    } catch (error) {
      console.error('Failed to start test container:', error)
      throw error
    }
  }, 120000) // 2 minute timeout for container startup

  afterAll(async () => {
    if (testContainer) {
      await cleanupClickHouseContainer(testContainer)
    }
  })

  afterEach(async () => {
    if (testContainer?.client) {
      await clearTestData(testContainer.client)
    }
  })

  const runEffect = <A, E>(effect: Effect.Effect<A, E, AnnotationService>) =>
    Effect.runPromise(Effect.provide(effect, serviceLayer))

  describe('annotate', () => {
    it('should create a trace annotation', async () => {
      const annotationInput = {
        signalType: 'trace' as const,
        traceId: 'test-trace-123',
        spanId: 'test-span-456',
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag' as const,
        annotationKey: 'diag.test.unit',
        annotationValue: JSON.stringify({ test: true }),
        createdBy: 'test-unit'
      }

      // Decode the annotation to get proper Date objects
      const annotation = Schema.decodeSync(AnnotationSchema)(annotationInput)

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
      expect(typeof annotationId).toBe('string')
    })

    it('should create a metric annotation', async () => {
      const annotation: Annotation = {
        signalType: 'metric',
        metricName: 'test.metric.count',
        metricLabels: { environment: 'test' },
        timeRangeStart: new Date(),
        annotationType: 'llm',
        annotationKey: 'llm.anomaly.detected',
        annotationValue: JSON.stringify({ confidence: 0.95 }),
        createdBy: 'test-ai'
      }

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
    })

    it('should create a log annotation', async () => {
      const annotation: Annotation = {
        signalType: 'log',
        logTimestamp: new Date(),
        logBodyHash: 'test-hash-789',
        timeRangeStart: new Date(),
        annotationType: 'human',
        annotationKey: 'human.review.approved',
        annotationValue: JSON.stringify({ approved: true }),
        createdBy: 'test-reviewer'
      }

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
    })

    it('should handle annotation with TTL', async () => {
      const expiresAt = new Date(Date.now() + 3600000) // 1 hour from now

      const annotation: Annotation = {
        signalType: 'any',
        timeRangeStart: new Date(),
        annotationType: 'meta',
        annotationKey: 'meta.temporary.data',
        annotationValue: JSON.stringify({ temporary: true }),
        createdBy: 'test-ttl',
        expiresAt
      }

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
    })

    it('should handle annotation with parent relationship', async () => {
      // First create parent annotation
      const parentAnnotation: Annotation = {
        signalType: 'trace',
        timeRangeStart: new Date(),
        annotationType: 'diag',
        annotationKey: 'diag.parent.annotation',
        annotationValue: '{}',
        createdBy: 'test-parent'
      }

      const parentId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(parentAnnotation)
        })
      )

      // Then create child annotation
      const childAnnotation: Annotation = {
        signalType: 'trace',
        timeRangeStart: new Date(),
        annotationType: 'diag',
        annotationKey: 'diag.child.annotation',
        annotationValue: '{}',
        createdBy: 'test-child',
        parentAnnotationId: parentId
      }

      const childId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(childAnnotation)
        })
      )

      expect(childId).toBeTruthy()
      expect(childId).not.toBe(parentId)
    })
  })

  describe('query', () => {
    it('should query annotations with setup data', async () => {
      // Create some test annotations for querying
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          traceId: 'query-trace-1',
          serviceName: 'service-a',
          timeRangeStart: new Date(),
          annotationType: 'diag',
          annotationKey: 'diag.query.test',
          annotationValue: '{}',
          createdBy: 'test-query-setup'
        },
        {
          signalType: 'metric',
          metricName: 'test.metric',
          serviceName: 'service-b',
          timeRangeStart: new Date(),
          annotationType: 'llm',
          annotationKey: 'llm.query.test',
          annotationValue: '{}',
          createdBy: 'test-query-setup'
        },
        {
          signalType: 'log',
          serviceName: 'service-a',
          timeRangeStart: new Date(),
          annotationType: 'human',
          annotationKey: 'human.query.test',
          annotationValue: '{}',
          createdBy: 'test-query-setup'
        }
      ]

      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          for (const ann of annotations) {
            yield* service.annotate(ann)
          }
        })
      )

      // Now run the actual query tests
      // Query by signal type
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ signalType: 'trace' })
        })
      )

      const traceAnnotations = results.filter(
        r => r.createdBy === 'test-query-setup' && r.signalType === 'trace'
      )
      expect(traceAnnotations.length).toBeGreaterThan(0)
      expect(traceAnnotations.every(r => r.signalType === 'trace')).toBe(true)
    })

    it('should query annotations by service name', async () => {
      // Create test annotations first
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          serviceName: 'service-a',
          timeRangeStart: new Date(),
          annotationType: 'diag',
          annotationKey: 'diag.query.test',
          annotationValue: '{}',
          createdBy: 'test-query-setup'
        },
        {
          signalType: 'log',
          serviceName: 'service-a',
          timeRangeStart: new Date(),
          annotationType: 'human',
          annotationKey: 'human.query.test',
          annotationValue: '{}',
          createdBy: 'test-query-setup'
        }
      ]

      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          for (const ann of annotations) {
            yield* service.annotate(ann)
          }
        })
      )
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ serviceName: 'service-a' })
        })
      )

      const serviceAnnotations = results.filter(
        r => r.createdBy === 'test-query-setup' && r.serviceName === 'service-a'
      )
      expect(serviceAnnotations.length).toBe(2) // trace and log annotations
    })

    it('should query annotations by trace ID', async () => {
      // Create test annotation first
      const annotation: Annotation = {
        signalType: 'trace',
        traceId: 'query-trace-1',
        serviceName: 'service-a',
        timeRangeStart: new Date(),
        annotationType: 'diag',
        annotationKey: 'diag.trace.query',
        annotationValue: '{}',
        createdBy: 'test-trace-query'
      }

      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          yield* service.annotate(annotation)
        })
      )

      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ traceId: 'query-trace-1' })
        })
      )

      const traceAnnotations = results.filter(r => r.traceId === 'query-trace-1')
      expect(traceAnnotations.length).toBe(1)
      expect(traceAnnotations[0]?.traceId).toBe('query-trace-1')
    })

    it('should respect limit parameter', async () => {
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ limit: 2 })
        })
      )

      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should return empty array when no matches', async () => {
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ traceId: 'non-existent-trace' })
        })
      )

      expect(results).toEqual([])
    })
  })

  describe('deleteExpired', () => {
    it('should delete expired annotations', async () => {
      // Create an expired annotation
      const expiredAnnotation: Annotation = {
        signalType: 'any',
        timeRangeStart: new Date(),
        annotationType: 'meta',
        annotationKey: 'meta.expired.test',
        annotationValue: '{}',
        createdBy: 'test-expired',
        expiresAt: new Date(Date.now() - 1000) // Already expired
      }

      // Create a valid annotation
      const validAnnotation: Annotation = {
        signalType: 'any',
        timeRangeStart: new Date(),
        annotationType: 'meta',
        annotationKey: 'meta.valid.test',
        annotationValue: '{}',
        createdBy: 'test-valid',
        expiresAt: new Date(Date.now() + 3600000) // Expires in 1 hour
      }

      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          yield* service.annotate(expiredAnnotation)
          yield* service.annotate(validAnnotation)
        })
      )

      // Delete expired annotations
      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.deleteExpired()
        })
      )

      // Wait longer for ClickHouse to process the DELETE mutation
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Query to verify deletion
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ limit: 100 })
        })
      )

      const expiredResults = results.filter(r => r.createdBy === 'test-expired')
      const validResults = results.filter(r => r.createdBy === 'test-valid')

      expect(expiredResults.length).toBe(0)
      expect(validResults.length).toBeGreaterThan(0)
    })

    it('should handle no expired annotations gracefully', async () => {
      // Create only non-expired annotations
      const annotation: Annotation = {
        signalType: 'any',
        timeRangeStart: new Date(),
        annotationType: 'meta',
        annotationKey: 'meta.permanent.test',
        annotationValue: '{}',
        createdBy: 'test-permanent'
        // No expiresAt means it never expires
      }

      await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          yield* service.annotate(annotation)
        })
      )

      // Delete expired (should be no-op)
      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.deleteExpired()
        })
      )

      expect(result).toBe(0) // No annotations deleted

      // Verify annotation still exists
      const results = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.query({ limit: 100 })
        })
      )

      const permanentResults = results.filter(r => r.createdBy === 'test-permanent')
      expect(permanentResults.length).toBe(1)
    })
  })
})