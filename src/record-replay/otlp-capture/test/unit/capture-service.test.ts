/**
 * Unit tests for OtlpCaptureService
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { OtlpCaptureServiceTag, OtlpCaptureServiceLive } from '../../capture-service.js'
import { S3StorageTag, StorageErrorConstructors } from '../../../../storage/index.js'
import { mockCaptureConfig, mockOtlpTraceData } from '../fixtures/test-data.js'
import type { OTLPData } from '../../../../storage/schemas.js'
import type { RetentionConfig } from '../../../../storage/config.js'

// Mock S3Storage implementation for testing
const MockS3Storage = Layer.succeed(
  S3StorageTag,
  S3StorageTag.of({
    storeRawData: (_data: Uint8Array, _key: string) => Effect.succeed(undefined),
    retrieveRawData: (key: string) => {
      if (key.includes('metadata.json') && !key.includes('non-existent-session')) {
        const mockMetadata = {
          sessionId: 'test-session-001',
          startTime: new Date().toISOString(),
          status: 'completed',
          enabledFlags: ['paymentServiceFailure'],
          capturedTraces: 1,
          capturedMetrics: 0,
          capturedLogs: 0,
          totalSizeBytes: 1024,
          s3Prefix: 'sessions/test-session-001',
          createdBy: 'system:otlp-capture'
        }
        return Effect.succeed(new TextEncoder().encode(JSON.stringify(mockMetadata)))
      }
      return Effect.fail(StorageErrorConstructors.QueryError('File not found', `GET ${key}`))
    },
    deleteRawData: (_key: string) => Effect.succeed(undefined),
    archiveOTLPData: (_data: OTLPData, _timestamp: number) => Effect.succeed(undefined),
    applyRetentionPolicy: (_retention: RetentionConfig) => Effect.succeed(undefined),
    listObjects: (prefix?: string) => {
      if (prefix === 'sessions/') {
        return Effect.succeed(['sessions/test-session-001/metadata.json'])
      }
      return Effect.succeed([])
    },
    getObjectsCount: (prefix?: string, _maxKeys?: number) => {
      if (prefix === 'sessions/') {
        return Effect.succeed({objects: ['sessions/test-session-001/metadata.json'], totalCount: 1, isTruncated: false})
      }
      return Effect.succeed({objects: [], totalCount: 0, isTruncated: false})
    },
    healthCheck: () => Effect.succeed(true)
  })
)

const TestLayer = Layer.provide(OtlpCaptureServiceLive, MockS3Storage)

describe('OtlpCaptureService', () => {
  describe('startCapture', () => {
    it('should start a new capture session successfully', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag
        const result = yield* service.startCapture(mockCaptureConfig)

        expect(result.sessionId).toBe(mockCaptureConfig.sessionId)
        expect(result.status).toBe('active')
        expect(result.enabledFlags).toEqual(mockCaptureConfig.enabledFlags)
        expect(result.capturedTraces).toBe(0)
        expect(result.s3Prefix).toBe('sessions/test-session-001')

        return result
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if session already exists', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        // Start first session
        yield* service.startCapture(mockCaptureConfig)

        // Try to start same session again
        return yield* service.startCapture(mockCaptureConfig)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(TestLayer),
          Effect.flip,
          Effect.map(error => error.reason)
        )
      )

      expect(result).toBe('SessionAlreadyActive')
    })
  })

  describe('stopCapture', () => {
    it('should stop an active capture session', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        // Start session first
        yield* service.startCapture(mockCaptureConfig)

        // Stop the session
        const result = yield* service.stopCapture(mockCaptureConfig.sessionId)

        expect(result.sessionId).toBe(mockCaptureConfig.sessionId)
        expect(result.status).toBe('completed')
        expect(result.endTime).toBeDefined()

        return result
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if session not found', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag
        return yield* service.stopCapture('non-existent-session')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(TestLayer),
          Effect.flip,
          Effect.map(error => error.reason)
        )
      )

      expect(result).toBe('SessionNotFound')
    })
  })

  describe('captureOTLPData', () => {
    it('should capture OTLP trace data successfully', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        // Start session first
        yield* service.startCapture(mockCaptureConfig)

        // Capture some data
        const result = yield* service.captureOTLPData(
          mockCaptureConfig.sessionId,
          mockOtlpTraceData,
          'traces'
        )

        expect(result.signalType).toBe('traces')
        expect(result.compressed).toBe(true)
        expect(result.sizeBytes).toBeGreaterThan(0)
        expect(result.key).toContain('traces-')
        expect(result.key).toContain('.otlp.gz')

        return result
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if session not active', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag
        return yield* service.captureOTLPData(
          'non-existent-session',
          mockOtlpTraceData,
          'traces'
        )
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(TestLayer),
          Effect.flip,
          Effect.map(error => error.reason)
        )
      )

      expect(result).toBe('SessionNotFound')
    })
  })

  describe('getCaptureStatus', () => {
    it('should return status for active session', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        // Start session first
        const session = yield* service.startCapture(mockCaptureConfig)

        // Get status
        const status = yield* service.getCaptureStatus(mockCaptureConfig.sessionId)

        expect(status.sessionId).toBe(session.sessionId)
        expect(status.status).toBe('active')

        return status
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should load status from S3 if not in memory', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        // Try to get status for a session that exists in S3 but not memory
        const status = yield* service.getCaptureStatus('test-session-001')

        expect(status.sessionId).toBe('test-session-001')

        return status
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('listCaptureSessions', () => {
    it('should list all capture sessions', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpCaptureServiceTag

        const sessions = yield* service.listCaptureSessions()

        expect(Array.isArray(sessions)).toBe(true)
        // Mock S3 returns one session
        expect(sessions.length).toBe(1)
        expect(sessions[0]?.sessionId).toBe('test-session-001')

        return sessions
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })
})