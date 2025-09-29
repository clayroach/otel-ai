/**
 * Integration tests for OTLP capture and replay using testcontainers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect, Layer } from 'effect'
import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
import {
  OtlpCaptureServiceTag,
  OtlpCaptureServiceLive,
  OtlpReplayServiceTag,
  OtlpReplayServiceLive,
  OtlpHttpReplayClientLive
} from '../../index.js'
import { S3StorageTag } from '../../../../storage/index.js'
import { generateTestOtlpData } from '../fixtures/otlp-generator.js'

// This test uses testcontainers to spin up MinIO, so it should work in CI
describe('OTLP Capture and Replay Integration Tests', () => {
  let minioContainer: StartedTestContainer
  let s3Client: S3Client
  let testLayer: Layer.Layer<
    S3StorageTag | OtlpCaptureServiceTag | OtlpReplayServiceTag,
    unknown,
    never
  >

  beforeAll(async () => {
    console.log('🚀 Starting MinIO container...')

    // Start MinIO container
    minioContainer = await new GenericContainer('minio/minio:latest')
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER: 'test-user',
        MINIO_ROOT_PASSWORD: 'test-password'
      })
      .withCommand(['server', '/data'])
      .start()

    const minioPort = minioContainer.getMappedPort(9000)
    const minioHost = minioContainer.getHost()

    console.log(`✅ MinIO started at ${minioHost}:${minioPort}`)

    // Configure S3 client
    s3Client = new S3Client({
      endpoint: `http://${minioHost}:${minioPort}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test-user',
        secretAccessKey: 'test-password'
      },
      forcePathStyle: true
    })

    // Create test bucket
    await s3Client.send(new CreateBucketCommand({ Bucket: 'test-bucket' }))
    console.log('✅ Test bucket created')

    // Create test layer with MinIO configuration
    const testS3Config = {
      endpoint: `http://${minioHost}:${minioPort}`,
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-user',
      secretAccessKey: 'test-password',
      forcePathStyle: true,
      enableEncryption: false
    }

    // Override S3StorageLive with test configuration
    const S3StorageTestLive = Layer.effect(
      S3StorageTag,
      Effect.gen(function* () {
        const { makeS3Storage } = yield* Effect.promise(() =>
          import('../../../../storage/s3.js')
        )
        return yield* makeS3Storage(testS3Config)
      })
    )

    testLayer = Layer.mergeAll(
      S3StorageTestLive,
      OtlpHttpReplayClientLive,
      OtlpCaptureServiceLive.pipe(Layer.provide(S3StorageTestLive)),
      OtlpReplayServiceLive.pipe(Layer.provide(Layer.mergeAll(S3StorageTestLive, OtlpHttpReplayClientLive)))
    )
  }, 60000) // 60 second timeout for container startup

  afterAll(async () => {
    if (minioContainer) {
      await minioContainer.stop()
      console.log('✅ MinIO container stopped')
    }
  })

  describe('Capture Service', () => {
    it('should capture OTLP trace data', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Start capture session
        const session = yield* captureService.startCapture({
          sessionId: 'test-capture-1',
          description: 'Test capture session',
          enabledFlags: ['test-flag'],
          captureTraces: true,
          captureMetrics: false,
          captureLogs: false,
          compressionEnabled: true
        })

        expect(session.sessionId).toBe('test-capture-1')
        expect(session.status).toBe('active')

        // Generate test OTLP data
        const testOtlpData = generateTestOtlpData({
          serviceName: 'test-service',
          traceCount: 5,
          spanCount: 10
        })

        // Capture the data
        const captureRef = yield* captureService.captureOTLPData(
          session.sessionId,
          new TextEncoder().encode(JSON.stringify(testOtlpData)),
          'traces'
        )

        expect(captureRef.signalType).toBe('traces')
        expect(captureRef.compressed).toBe(true)
        expect(captureRef.sizeBytes).toBeGreaterThan(0)

        // Stop capture session
        const finalSession = yield* captureService.stopCapture(session.sessionId)
        expect(finalSession.status).toBe('completed')
        expect(finalSession.capturedTraces).toBe(1)

        return finalSession
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toBeDefined()
    })

    it('should list capture sessions', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Create multiple sessions
        yield* captureService.startCapture({
          sessionId: 'list-test-1',
          description: 'First test session',
          enabledFlags: [],
          captureTraces: true,
          captureMetrics: true,
          captureLogs: true,
          compressionEnabled: true
        })

        yield* captureService.startCapture({
          sessionId: 'list-test-2',
          description: 'Second test session',
          enabledFlags: ['flag1', 'flag2'],
          captureTraces: true,
          captureMetrics: false,
          captureLogs: false,
          compressionEnabled: true
        })

        // Stop the first session
        yield* captureService.stopCapture('list-test-1')

        // List all sessions
        const sessions = yield* captureService.listCaptureSessions()

        expect(sessions.length).toBeGreaterThanOrEqual(2)

        const session1 = sessions.find(s => s.sessionId === 'list-test-1')
        expect(session1?.status).toBe('completed')

        const session2 = sessions.find(s => s.sessionId === 'list-test-2')
        expect(session2?.status).toBe('active')

        // Clean up
        yield* captureService.stopCapture('list-test-2')

        return sessions
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('Replay Service', () => {
    it('should replay captured OTLP data', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        const replayService = yield* OtlpReplayServiceTag

        // First, capture some data
        const captureSession = yield* captureService.startCapture({
          sessionId: 'replay-test-1',
          description: 'Session for replay testing',
          enabledFlags: ['replay-test'],
          captureTraces: true,
          captureMetrics: false,
          captureLogs: false,
          compressionEnabled: true
        })

        // Generate and capture test data
        const testData1 = generateTestOtlpData({
          serviceName: 'replay-service-1',
          traceCount: 3,
          spanCount: 5
        })

        yield* captureService.captureOTLPData(
          captureSession.sessionId,
          new TextEncoder().encode(JSON.stringify(testData1)),
          'traces'
        )

        const testData2 = generateTestOtlpData({
          serviceName: 'replay-service-2',
          traceCount: 2,
          spanCount: 8,
          includeErrors: true
        })

        yield* captureService.captureOTLPData(
          captureSession.sessionId,
          new TextEncoder().encode(JSON.stringify(testData2)),
          'traces'
        )

        // Stop capture
        const completedSession = yield* captureService.stopCapture(captureSession.sessionId)
        expect(completedSession.capturedTraces).toBe(2)

        // List available replays
        const availableReplays = yield* replayService.listAvailableReplays()
        const replaySession = availableReplays.find(s => s.sessionId === 'replay-test-1')
        expect(replaySession).toBeDefined()
        expect(replaySession?.status).toBe('completed')

        // Start replay with timestamp adjustment
        const replayStatus = yield* replayService.startReplay({
          sessionId: 'replay-test-1',
          timestampAdjustment: 'current',
          speedMultiplier: 10.0, // 10x speed for testing
          replayTraces: true,
          replayMetrics: false,
          replayLogs: false
        })

        expect(replayStatus.status).toBe('pending')
        expect(replayStatus.totalRecords).toBe(2)

        // Wait for replay to complete (it's async)
        yield* Effect.sleep('2 seconds')

        // Check replay status
        const finalStatus = yield* replayService.getReplayStatus('replay-test-1')
        expect(finalStatus.processedRecords).toBeGreaterThan(0)

        return finalStatus
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toBeDefined()
    }, 30000) // 30 second timeout for replay test

    it('should stream replay data', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        const replayService = yield* OtlpReplayServiceTag

        // Capture some data first
        const session = yield* captureService.startCapture({
          sessionId: 'stream-test-1',
          description: 'Stream test session',
          enabledFlags: [],
          captureTraces: true,
          captureMetrics: true,
          captureLogs: false,
          compressionEnabled: true
        })

        // Capture multiple data chunks
        for (let i = 0; i < 5; i++) {
          const data = generateTestOtlpData({
            serviceName: `stream-service-${i}`,
            traceCount: 1,
            spanCount: 3
          })

          yield* captureService.captureOTLPData(
            session.sessionId,
            new TextEncoder().encode(JSON.stringify(data)),
            'traces'
          )
        }

        yield* captureService.stopCapture(session.sessionId)

        // Stream the replay data
        const stream = replayService.replayDataStream('stream-test-1', 'traces')

        // Collect stream data
        const { Stream } = yield* Effect.promise(() => import('effect'))
        const chunks = yield* Stream.runCollect(stream.pipe(Stream.take(3)))

        expect(chunks.length).toBeGreaterThan(0)

        // Each chunk should be a Uint8Array
        for (const chunk of chunks) {
          expect(chunk).toBeInstanceOf(Uint8Array)
          expect(chunk.length).toBeGreaterThan(0)
        }

        return chunks.length
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle session not found errors', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Try to get non-existent session
        const result = yield* captureService
          .getCaptureStatus('non-existent-session')
          .pipe(
            Effect.catchTag('CaptureError', (error) =>
              Effect.succeed({
                error: true,
                reason: error.reason,
                message: error.message
              })
            )
          )

        return result
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveProperty('error', true)
      expect(result).toHaveProperty('reason', 'SessionNotFound')
    })

    it('should handle duplicate session errors', async () => {
      const program = Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag

        // Create first session
        yield* captureService.startCapture({
          sessionId: 'duplicate-test',
          description: 'First session',
          enabledFlags: [],
          captureTraces: true,
          captureMetrics: false,
          captureLogs: false,
          compressionEnabled: true
        })

        // Try to create duplicate session
        const result = yield* captureService
          .startCapture({
            sessionId: 'duplicate-test',
            description: 'Duplicate session',
            enabledFlags: [],
            captureTraces: true,
            captureMetrics: false,
            captureLogs: false,
            compressionEnabled: true
          })
          .pipe(
            Effect.catchTag('CaptureError', (error) =>
              Effect.succeed({
                error: true,
                reason: error.reason,
                sessionId: error.sessionId
              })
            )
          )

        // Clean up
        yield* captureService.stopCapture('duplicate-test').pipe(
          Effect.catchAll(() => Effect.succeed(null))
        )

        return result
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveProperty('error', true)
      expect(result).toHaveProperty('reason', 'SessionAlreadyActive')
      expect(result).toHaveProperty('sessionId', 'duplicate-test')
    })
  })
})