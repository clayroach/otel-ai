/**
 * Unit tests for RetentionService with mocked dependencies
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  RetentionServiceTag,
  RetentionServiceLive,
  type RetentionPolicy
} from '../../../retention/retention-service.js'
import { S3StorageTag, type S3Storage } from '../../../../storage/s3.js'

describe('RetentionService Unit Tests', () => {
  const testPolicy: RetentionPolicy = {
    continuous: {
      retentionDays: 1, // Short retention for testing
      cleanupSchedule: '*/5 * * * *', // Every 5 minutes for testing
      enabled: true
    },
    sessions: {
      defaultRetentionDays: 7,
      maxRetentionDays: 30,
      archiveAfterDays: 3,
      cleanupEnabled: true
    }
  }

  // Create a comprehensive mock S3Storage for testing
  const MockS3Storage: S3Storage = {
    storeRawData: () => Effect.succeed(undefined),
    retrieveRawData: (key: string) => {
      if (key.includes('metadata.json')) {
        const metadata = {
          sessionId: 'test-session',
          startTime: new Date('2025-01-01T00:00:00Z').toISOString(),
          status: 'completed'
        }
        return Effect.succeed(new TextEncoder().encode(JSON.stringify(metadata)))
      }
      return Effect.succeed(new Uint8Array())
    },
    deleteRawData: () => Effect.succeed(undefined),
    archiveOTLPData: () => Effect.succeed(undefined),
    applyRetentionPolicy: () => Effect.succeed(undefined),
    listObjects: (prefix?: string) => {
      if (prefix?.startsWith('continuous/')) {
        // Return some old data for cleanup testing
        return Effect.succeed([
          'continuous/2024-12-01/traces-old.otlp.gz',
          'continuous/2025-01-20/traces-recent.otlp.gz'
        ])
      }
      if (prefix?.startsWith('sessions/')) {
        return Effect.succeed([
          'sessions/test-session-1/metadata.json',
          'sessions/test-session-1/raw/2025-01-01/traces-123.otlp.gz',
          'sessions/test-session-2/metadata.json'
        ])
      }
      return Effect.succeed([])
    },
    getObjectsCount: (prefix?: string, _maxKeys?: number) => {
      if (prefix?.startsWith('continuous/')) {
        return Effect.succeed({
          objects: ['continuous/2024-12-01/traces-old.otlp.gz', 'continuous/2025-01-20/traces-recent.otlp.gz'],
          totalCount: 2,
          isTruncated: false
        })
      }
      if (prefix?.startsWith('sessions/')) {
        return Effect.succeed({
          objects: ['sessions/test-session-1/metadata.json', 'sessions/test-session-2/metadata.json'],
          totalCount: 3,
          isTruncated: false
        })
      }
      return Effect.succeed({objects: [], totalCount: 0, isTruncated: false})
    },
    healthCheck: () => Effect.succeed(true)
  }

  const MockS3StorageLayer = Layer.succeed(S3StorageTag, MockS3Storage)
  const TestLayer = Layer.mergeAll(
    MockS3StorageLayer,
    RetentionServiceLive.pipe(Layer.provide(MockS3StorageLayer))
  )

  const runTest = <A, E>(effect: Effect.Effect<A, E, RetentionServiceTag | S3StorageTag>) =>
    Effect.runPromise(Effect.provide(effect, TestLayer))

  beforeEach(async () => {
    // Clean up any existing test data
    // This would be more comprehensive in a real test environment
  })

  it('should get storage usage metrics', async () => {
    const usage = await runTest(
      Effect.gen(function* () {
        const retention = yield* RetentionServiceTag
        return yield* retention.getStorageUsage()
      })
    )

    expect(usage).toBeDefined()
    expect(usage.continuousPath).toBeDefined()
    expect(usage.sessionsPath).toBeDefined()
    expect(typeof usage.totalSizeBytes).toBe('number')

    // Verify structure matches expected metrics
    expect(usage.continuousPath.totalObjects).toBeGreaterThanOrEqual(0)
    expect(usage.sessionsPath.totalObjects).toBeGreaterThanOrEqual(0)
    expect(usage.sessionsPath.activeSessions).toBeGreaterThanOrEqual(0)
    expect(usage.sessionsPath.completedSessions).toBeGreaterThanOrEqual(0)
  })

  it('should cleanup continuous data based on retention period', async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const retention = yield* RetentionServiceTag
        // Test cleanup of data older than 30 days (should catch 2024-12-01 data)
        return yield* retention.cleanupContinuousData(30)
      })
    )

    expect(result).toBeDefined()
    expect(result.deletedObjects).toBeGreaterThanOrEqual(0)
    expect(result.freedSpaceBytes).toBeGreaterThanOrEqual(0)
    expect(result.processedPaths).toContain('continuous/')
    expect(Array.isArray(result.errors)).toBe(true)
    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('should archive old sessions', async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const retention = yield* RetentionServiceTag
        return yield* retention.archiveOldSessions(30)
      })
    )

    expect(result).toBeDefined()
    expect(typeof result.deletedObjects).toBe('number')
    expect(typeof result.freedSpaceBytes).toBe('number')
    expect(result.processedPaths).toContain('sessions/')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should start retention jobs without errors', async () => {
    await runTest(
      Effect.gen(function* () {
        const retention = yield* RetentionServiceTag
        // This should not throw an error
        yield* retention.scheduleRetentionJobs(testPolicy)
        return 'success'
      })
    ).then(result => {
      expect(result).toBe('success')
    })
  })

  it('should handle session data management for existing sessions', async () => {
    const sessionId = 'test-session-1' // This exists in our mock

    const result = await runTest(
      Effect.gen(function* () {
        const retention = yield* RetentionServiceTag
        // This should succeed since the session exists in our mock
        yield* retention.manageSessionData(sessionId, testPolicy.sessions)
        return 'success'
      })
    )

    expect(result).toBe('success')
  })

  it('should validate retention policy configuration', () => {
    expect(testPolicy.continuous.retentionDays).toBeGreaterThan(0)
    expect(testPolicy.continuous.enabled).toBe(true)
    expect(testPolicy.sessions.defaultRetentionDays).toBeGreaterThan(0)
    expect(testPolicy.sessions.maxRetentionDays).toBeGreaterThan(testPolicy.sessions.defaultRetentionDays)
    expect(testPolicy.sessions.cleanupEnabled).toBe(true)
  })
})