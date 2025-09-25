/**
 * Unit tests for OtlpReplayService
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { OtlpReplayServiceTag, OtlpReplayServiceLive } from '../../replay-service.js'
import { S3StorageTag, StorageErrorConstructors } from '../../../storage/index.js'
import { mockReplayConfig, mockSessionMetadata, mockOtlpJsonData } from '../fixtures/test-data.js'
import type { OTLPData } from '../../../storage/schemas.js'
import type { RetentionConfig } from '../../../storage/config.js'
import * as zlib from 'node:zlib'

// Mock S3Storage implementation for testing
const MockS3Storage = Layer.succeed(
  S3StorageTag,
  S3StorageTag.of({
    storeRawData: (_data: Uint8Array, _key: string) => Effect.succeed(undefined),
    retrieveRawData: (key: string) => {
      if (key.includes('metadata.json')) {
        // Check for non-existent session
        if (key.includes('non-existent')) {
          return Effect.fail(StorageErrorConstructors.QueryError('File not found', `GET ${key}`))
        }
        return Effect.succeed(new TextEncoder().encode(JSON.stringify(mockSessionMetadata)))
      }
      if (key.includes('traces-')) {
        // Return compressed mock OTLP data
        const jsonData = JSON.stringify(mockOtlpJsonData)
        const compressed = zlib.gzipSync(Buffer.from(jsonData, 'utf8'))
        return Effect.succeed(new Uint8Array(compressed))
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
      if (prefix?.includes('raw/')) {
        return Effect.succeed([
          'sessions/test-session-001/raw/2024-01-01/10/traces-1704110400000-uuid.otlp.gz'
        ])
      }
      return Effect.succeed([])
    },
    healthCheck: () => Effect.succeed(true)
  })
)

const TestLayer = Layer.provide(OtlpReplayServiceLive, MockS3Storage)

describe('OtlpReplayService', () => {
  describe('startReplay', () => {
    it('should start a replay successfully', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag
        const result = yield* service.startReplay(mockReplayConfig)

        expect(result.sessionId).toBe(mockReplayConfig.sessionId)
        expect(result.status).toBe('pending')
        expect(result.totalRecords).toBeGreaterThan(0)
        expect(result.processedRecords).toBe(0)
        expect(result.startedAt).toBeDefined()

        return result
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if session metadata not found', async () => {
      const invalidConfig = { ...mockReplayConfig, sessionId: 'non-existent' }

      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag
        return yield* service.startReplay(invalidConfig)
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

  describe('getReplayStatus', () => {
    it('should return replay status', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag

        // Start replay first
        yield* service.startReplay(mockReplayConfig)

        // Get status
        const status = yield* service.getReplayStatus(mockReplayConfig.sessionId)

        expect(status.sessionId).toBe(mockReplayConfig.sessionId)
        expect(['pending', 'running', 'completed'].includes(status.status)).toBe(true)

        return status
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if replay not found', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag
        return yield* service.getReplayStatus('non-existent-session')
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

  describe('listAvailableReplays', () => {
    it('should list available completed sessions', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag
        const sessions = yield* service.listAvailableReplays()

        expect(Array.isArray(sessions)).toBe(true)
        expect(sessions.length).toBe(1)
        expect(sessions[0]?.sessionId).toBe('test-session-001')
        expect(sessions[0]?.status).toBe('completed')

        return sessions
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('replayDataStream', () => {
    it('should create a stream of replay data', async () => {
      const program = Effect.gen(function* () {
        const service = yield* OtlpReplayServiceTag
        const stream = service.replayDataStream('test-session-001', 'traces')

        // Just verify the stream is created without collecting data
        // (Stream collection is more complex and better tested in integration tests)
        expect(stream).toBeDefined()

        return 'stream-created'
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
      expect(result).toBe('stream-created')
    })
  })
})