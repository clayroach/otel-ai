/**
 * Simplified unit tests for annotation service
 * Tests service logic without requiring ClickHouse container
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'
import {
  AnnotationService,
  AnnotationServiceLive
} from '../../annotation-service.js'
import { AnnotationSchema } from '../../annotation.schema.js'
import { StorageServiceTag, type StorageService } from '../../../storage/services.js'

describe('AnnotationService Logic Tests', () => {
  // Create a mock storage service
  const mockStorage: StorageService = {
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
    queryRaw: () => Effect.succeed([]),
    insertRaw: () => Effect.succeed(undefined),
    queryText: () => Effect.succeed(''),
    archiveData: () => Effect.succeed(undefined),
    applyRetentionPolicies: () => Effect.succeed(undefined),
    healthCheck: () => Effect.succeed({ clickhouse: true, s3: true }),
    getStorageStats: () => Effect.succeed({
      clickhouse: { totalTraces: 0, totalMetrics: 0, totalLogs: 0, diskUsage: '0 GB' },
      s3: { totalObjects: 0, totalSize: '0 GB', oldestObject: null, newestObject: null }
    })
  }

  const mockStorageLayer = Layer.succeed(StorageServiceTag, mockStorage)
  const serviceLayer = Layer.provide(AnnotationServiceLive, mockStorageLayer)

  const runEffect = <A, E>(effect: Effect.Effect<A, E, AnnotationService>) =>
    Effect.runPromise(Effect.provide(effect, serviceLayer))

  describe('annotation validation', () => {
    it('should validate annotation key prefixes', () => {
      const validPrefixes = ['test.', 'diag.', 'human.', 'llm.', 'meta.', 'train.']

      validPrefixes.forEach(prefix => {
        const annotation = {
          signalType: 'trace' as const,
          timeRangeStart: new Date().toISOString(),
          annotationType: prefix.slice(0, -1) as 'test' | 'diag' | 'human' | 'llm' | 'meta' | 'train',
          annotationKey: `${prefix}valid.key`,
          annotationValue: '{}',
          createdBy: 'test'
        }

        expect(() => Schema.decodeSync(AnnotationSchema)(annotation)).not.toThrow()
      })
    })

    it('should reject invalid annotation key prefixes', () => {
      const annotation = {
        signalType: 'trace' as const,
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag' as const,
        annotationKey: 'invalid.prefix',
        annotationValue: '{}',
        createdBy: 'test'
      }

      expect(() => Schema.decodeSync(AnnotationSchema)(annotation)).toThrow()
    })
  })

  describe('service operations', () => {
    it('should generate annotation ID if not provided', async () => {
      const annotation = Schema.decodeSync(AnnotationSchema)({
        signalType: 'trace',
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag',
        annotationKey: 'diag.test.id',
        annotationValue: '{}',
        createdBy: 'test'
      })

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
      expect(typeof annotationId).toBe('string')
    })

    it('should handle all signal types', async () => {
      const signalTypes = ['trace', 'metric', 'log', 'any'] as const

      for (const signalType of signalTypes) {
        const annotation = Schema.decodeSync(AnnotationSchema)({
          signalType,
          timeRangeStart: new Date().toISOString(),
          annotationType: 'diag',
          annotationKey: 'diag.signal.test',
          annotationValue: '{}',
          createdBy: 'test'
        })

        const annotationId = await runEffect(
          Effect.gen(function* () {
            const service = yield* AnnotationService
            return yield* service.annotate(annotation)
          })
        )

        expect(annotationId).toBeTruthy()
      }
    })

    it('should handle optional fields correctly', async () => {
      const annotation = Schema.decodeSync(AnnotationSchema)({
        signalType: 'any',
        timeRangeStart: new Date().toISOString(),
        timeRangeEnd: new Date(Date.now() + 3600000).toISOString(),
        serviceName: 'test-service',
        annotationType: 'meta',
        annotationKey: 'meta.optional.test',
        annotationValue: '{}',
        createdBy: 'test',
        confidence: 0.8,
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      })

      const annotationId = await runEffect(
        Effect.gen(function* () {
          const service = yield* AnnotationService
          return yield* service.annotate(annotation)
        })
      )

      expect(annotationId).toBeTruthy()
    })
  })
})