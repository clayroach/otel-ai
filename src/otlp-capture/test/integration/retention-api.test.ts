/**
 * Integration tests for OTLP Capture + Retention API endpoints
 * Tests the complete end-to-end workflow of OTLP capture with retention management
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer } from 'effect'
import { OtlpCaptureServiceTag, OtlpCaptureServiceLive } from '../../capture-service.js'
import { RetentionServiceTag, RetentionServiceLive } from '../../retention-service.js'
import { S3StorageTag, S3StorageLive } from '../../../storage/s3.js'
import { mockCaptureConfig, mockOtlpTraceData } from '../fixtures/test-data.js'
import type { RetentionPolicy } from '../../index.js'

// Integration test layer with real S3Storage (using MinIO)
const IntegrationLayer = Layer.mergeAll(
  S3StorageLive,
  OtlpCaptureServiceLive.pipe(Layer.provide(S3StorageLive)),
  RetentionServiceLive.pipe(Layer.provide(S3StorageLive))
)

const runTest = <A, E>(
  effect: Effect.Effect<A, E, OtlpCaptureServiceTag | RetentionServiceTag | S3StorageTag>
) => Effect.runPromise(Effect.provide(effect, IntegrationLayer))

describe('OTLP Capture + Retention Integration Tests', () => {
  const testSessionId = `integration-test-${Date.now()}`

  beforeAll(async () => {
    // Create a test capture session
    await runTest(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        return yield* captureService.startCapture({
          ...mockCaptureConfig,
          sessionId: testSessionId,
          description: 'Integration test session for retention testing'
        })
      })
    )

    // Add some test data
    await runTest(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Capture multiple data points
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'traces')
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'metrics')
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'logs')
      })
    )
  })

  afterAll(async () => {
    // Clean up test session
    try {
      await runTest(
        Effect.gen(function* () {
          const s3Storage = yield* S3StorageTag

          // List and delete all objects for this test session
          const objects = yield* s3Storage.listObjects(`sessions/${testSessionId}/`)

          yield* Effect.forEach(
            objects,
            (key) => s3Storage.deleteRawData(key),
            { concurrency: 5 }
          )
        })
      )
    } catch (error) {
      console.warn('Failed to clean up test session:', error)
    }
  })

  describe('Storage Usage Metrics', () => {
    it('should retrieve storage usage metrics including test session data', async () => {
      const metrics = await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          return yield* retentionService.getStorageUsage()
        })
      )

      expect(metrics).toBeDefined()
      expect(typeof metrics.totalSizeBytes).toBe('number')
      expect(metrics.continuousPath).toBeDefined()
      expect(metrics.sessionsPath).toBeDefined()

      // Test session should be included in metrics
      expect(metrics.sessionsPath.totalObjects).toBeGreaterThanOrEqual(3) // metadata + 3 data files
      expect(metrics.sessionsPath.totalSizeBytes).toBeGreaterThan(0)
    })
  })

  describe('Session Data Management', () => {
    it('should manage session data with retention policy', async () => {
      const testPolicy: RetentionPolicy['sessions'] = {
        defaultRetentionDays: 7,
        maxRetentionDays: 30,
        archiveAfterDays: 3,
        cleanupEnabled: true
      }

      await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          yield* retentionService.manageSessionData(testSessionId, testPolicy)
        })
      )

      // Verify session still exists (should not be deleted yet due to age)
      const sessionStatus = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.getCaptureStatus(testSessionId)
        })
      )

      expect(sessionStatus).toBeDefined()
      expect(sessionStatus.sessionId).toBe(testSessionId)
    })
  })

  describe('Continuous Data Cleanup', () => {
    it('should perform continuous data cleanup without affecting session data', async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          // Use a very old date to avoid deleting recent test data
          return yield* retentionService.cleanupContinuousData(365)
        })
      )

      expect(result).toBeDefined()
      expect(result.deletedObjects).toBeGreaterThanOrEqual(0)
      expect(result.freedSpaceBytes).toBeGreaterThanOrEqual(0)
      expect(result.processedPaths).toContain('continuous/')
      expect(Array.isArray(result.errors)).toBe(true)
      expect(typeof result.duration).toBe('number')

      // Verify test session still exists
      const sessionStatus = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.getCaptureStatus(testSessionId)
        })
      )

      expect(sessionStatus.sessionId).toBe(testSessionId)
    })
  })

  describe('Archive Old Sessions', () => {
    it('should archive sessions without deleting recent test data', async () => {
      const result = await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          // Use a very old date to avoid archiving recent test data
          return yield* retentionService.archiveOldSessions(365)
        })
      )

      expect(result).toBeDefined()
      expect(result.deletedObjects).toBeGreaterThanOrEqual(0)
      expect(result.freedSpaceBytes).toBeGreaterThanOrEqual(0)
      expect(result.processedPaths).toContain('sessions/')
      expect(Array.isArray(result.errors)).toBe(true)

      // Verify test session still exists
      const sessionStatus = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.getCaptureStatus(testSessionId)
        })
      )

      expect(sessionStatus.sessionId).toBe(testSessionId)
    })
  })

  describe('Retention Jobs', () => {
    it('should start retention jobs with valid policy', async () => {
      const testPolicy: RetentionPolicy = {
        continuous: {
          retentionDays: 30,
          cleanupSchedule: '0 2 * * *', // Daily at 2 AM
          enabled: true
        },
        sessions: {
          defaultRetentionDays: 7,
          maxRetentionDays: 30,
          archiveAfterDays: 3,
          cleanupEnabled: true
        }
      }

      // This should not throw an error
      await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          yield* retentionService.scheduleRetentionJobs(testPolicy)
        })
      )

      // No explicit verification since this just starts background jobs
      // The test passes if no error is thrown
    })

    it('should handle disabled retention gracefully', async () => {
      const disabledPolicy: RetentionPolicy = {
        continuous: {
          retentionDays: 30,
          cleanupSchedule: '0 2 * * *',
          enabled: false // Disabled
        },
        sessions: {
          defaultRetentionDays: 7,
          maxRetentionDays: 30,
          cleanupEnabled: false // Disabled
        }
      }

      // This should not throw an error even when disabled
      await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          yield* retentionService.scheduleRetentionJobs(disabledPolicy)
        })
      )
    })
  })

  describe('End-to-End Workflow', () => {
    it('should handle complete capture session lifecycle with retention', async () => {
      const e2eSessionId = `e2e-test-${Date.now()}`

      // 1. Start capture session
      const session = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.startCapture({
            ...mockCaptureConfig,
            sessionId: e2eSessionId,
            description: 'End-to-end test session'
          })
        })
      )

      expect(session.sessionId).toBe(e2eSessionId)
      expect(session.status).toBe('active')

      // 2. Capture some data
      const captureResult = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.captureOTLPData(e2eSessionId, mockOtlpTraceData, 'traces')
        })
      )

      expect(captureResult.signalType).toBe('traces')
      expect(captureResult.compressed).toBe(true)

      // 3. Stop capture session
      const completedSession = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.stopCapture(e2eSessionId)
        })
      )

      expect(completedSession.status).toBe('completed')
      expect(completedSession.endTime).toBeDefined()
      expect(completedSession.capturedTraces).toBe(1)

      // 4. Verify storage usage reflects the new session
      const metrics = await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          return yield* retentionService.getStorageUsage()
        })
      )

      expect(metrics.sessionsPath.totalObjects).toBeGreaterThan(0)
      expect(metrics.totalSizeBytes).toBeGreaterThan(0)

      // 5. Apply retention policy (should not delete recent data)
      const retentionPolicy: RetentionPolicy['sessions'] = {
        defaultRetentionDays: 1,
        maxRetentionDays: 7,
        cleanupEnabled: true
      }

      await runTest(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          yield* retentionService.manageSessionData(e2eSessionId, retentionPolicy)
        })
      )

      // 6. Verify session still exists (too recent to be deleted)
      const finalStatus = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          return yield* captureService.getCaptureStatus(e2eSessionId)
        })
      )

      expect(finalStatus.sessionId).toBe(e2eSessionId)
      expect(finalStatus.status).toBe('completed')

      // Clean up E2E test session
      await runTest(
        Effect.gen(function* () {
          const s3Storage = yield* S3StorageTag
          const objects = yield* s3Storage.listObjects(`sessions/${e2eSessionId}/`)

          yield* Effect.forEach(
            objects,
            (key) => s3Storage.deleteRawData(key),
            { concurrency: 5 }
          )
        })
      )
    })
  })
})