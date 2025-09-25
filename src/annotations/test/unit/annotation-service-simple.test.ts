/**
 * Simplified unit tests for annotation service
 * Tests service logic without requiring ClickHouse container
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'
import {
  AnnotationService,
  AnnotationServiceLive,
  ClickhouseClient
} from '../../annotation-service.js'
import { AnnotationSchema } from '../../annotation.schema.js'
import type { ClickHouseClient } from '@clickhouse/client'

describe('AnnotationService Logic Tests', () => {
  // Create a mock ClickHouse client
  const mockClient: Partial<ClickHouseClient> = {
    insert: async () => ({ query_id: 'mock-query-id', executed: true, response_headers: {} }),
    query: async () => {
      return {
        json: async () => [],
        text: async () => '',
        stream: async function* () {
          yield { rows: [] }
        }
      } as unknown as Awaited<ReturnType<ClickHouseClient['query']>>
    },
    command: async () => ({
      query_id: 'mock-query-id',
      response_headers: {}
    }),
    ping: async () => ({ success: true })
  }

  const mockClickhouseLayer = Layer.succeed(ClickhouseClient, mockClient as ClickHouseClient)
  const serviceLayer = Layer.provide(AnnotationServiceLive, mockClickhouseLayer)

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