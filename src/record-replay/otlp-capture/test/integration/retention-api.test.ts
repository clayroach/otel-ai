/**
 * Integration tests for OTLP Capture + Retention API endpoints
 * Tests the complete end-to-end workflow of OTLP capture with retention management
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer } from 'effect'
import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
import { OtlpCaptureServiceTag, OtlpCaptureServiceLive } from '../../capture-service.js'
import { RetentionServiceTag, RetentionServiceLive } from '../../../retention/retention-service.js'
import { S3StorageTag, makeS3Storage } from '../../../../storage/s3.js'
import { mockCaptureConfig, mockOtlpTraceData } from '../fixtures/test-data.js'
import type { RetentionPolicy } from '../../index.js'

describe('OTLP Capture + Retention Integration Tests', () => {
  let minioContainer: StartedTestContainer
  let s3Client: S3Client
  let testLayer: Layer.Layer<
    S3StorageTag | OtlpCaptureServiceTag | RetentionServiceTag,
    unknown,
    never
  >

  const testSessionId = `integration-test-${Date.now()}`

  // Helper function to run tests with the layer
  const runTest = <A, E>(
    effect: Effect.Effect<A, E, OtlpCaptureServiceTag | RetentionServiceTag | S3StorageTag>
  ) => Effect.runPromise(Effect.provide(effect, testLayer))

  beforeAll(async () => {
    console.log('🚀 Starting MinIO container...')

    // Start MinIO container
    minioContainer = await new GenericContainer('minio/minio:latest')
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin'
      })
      .withCommand(['server', '/data'])
      .start()

    const host = minioContainer.getHost()
    const port = minioContainer.getMappedPort(9000)

    console.log(`✅ MinIO started on ${host}:${port}`)

    // Create S3 client
    s3Client = new S3Client({
      endpoint: `http://${host}:${port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin'
      },
      forcePathStyle: true
    })

    // Create test bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: 'otel-data'
      })
    )

    console.log('✅ Test bucket created')

    // Create the test layer with real S3Storage
    const s3Storage = await Effect.runPromise(
      makeS3Storage({
        endpoint: `http://${host}:${port}`,
        region: 'us-east-1',
        bucket: 'otel-data',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
        forcePathStyle: true
      })
    )

    const s3Layer = Layer.succeed(S3StorageTag, s3Storage)

    testLayer = Layer.mergeAll(
      s3Layer,
      OtlpCaptureServiceLive.pipe(Layer.provide(s3Layer)),
      RetentionServiceLive.pipe(Layer.provide(s3Layer))
    )

    // Create a test capture session and add some test data
    await Effect.runPromise(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Start capture session
        yield* captureService.startCapture({
          ...mockCaptureConfig,
          sessionId: testSessionId,
          description: 'Integration test session for retention testing'
        })

        // Capture multiple data points in the same effect
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'traces')
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'metrics')
        yield* captureService.captureOTLPData(testSessionId, mockOtlpTraceData, 'logs')
      }).pipe(Effect.provide(testLayer))
    )
  })

  afterAll(async () => {
    // Clean up
    if (minioContainer) {
      console.log('🧹 Stopping MinIO container...')
      await minioContainer.stop()
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

      const result = await runTest(
        Effect.gen(function* () {
          const captureService = yield* OtlpCaptureServiceTag
          const retentionService = yield* RetentionServiceTag

          // 1. Start capture session
          const session = yield* captureService.startCapture({
            ...mockCaptureConfig,
            sessionId: e2eSessionId,
            description: 'End-to-end test session'
          })

          // 2. Capture some data
          const captureResult = yield* captureService.captureOTLPData(
            e2eSessionId,
            mockOtlpTraceData,
            'traces'
          )

          // 3. Stop capture session
          const completedSession = yield* captureService.stopCapture(e2eSessionId)

          // 4. Get storage usage
          const metrics = yield* retentionService.getStorageUsage()

          // 5. Apply retention policy
          const retentionPolicy: RetentionPolicy['sessions'] = {
            defaultRetentionDays: 1,
            maxRetentionDays: 7,
            cleanupEnabled: true
          }
          yield* retentionService.manageSessionData(e2eSessionId, retentionPolicy)

          // 6. Get final status
          const finalStatus = yield* captureService.getCaptureStatus(e2eSessionId)

          return {
            session,
            captureResult,
            completedSession,
            metrics,
            finalStatus
          }
        })
      )

      expect(result.session.sessionId).toBe(e2eSessionId)
      expect(result.session.status).toBe('active')
      expect(result.captureResult.signalType).toBe('traces')
      expect(result.captureResult.compressed).toBe(true)
      expect(result.completedSession.status).toBe('completed')
      expect(result.completedSession.endTime).toBeDefined()
      expect(result.completedSession.capturedTraces).toBe(1)
      expect(result.metrics.sessionsPath.totalObjects).toBeGreaterThan(0)
      expect(result.metrics.totalSizeBytes).toBeGreaterThan(0)
      expect(result.finalStatus.sessionId).toBe(e2eSessionId)
      expect(result.finalStatus.status).toBe('completed')

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