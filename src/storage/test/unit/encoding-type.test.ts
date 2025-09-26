/**
 * Unit test for encoding type functionality in StorageAPIClient
 * Ensures JSON and protobuf encoding types are properly passed through
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer, Exit } from 'effect'
import { 
  StorageAPIClientTag,
  ClickHouseConfigTag, 
  StorageAPIClientLayer,
  type OTLPData
} from '../../index.js'



describe('StorageAPIClient Encoding Type', () => {
  const testData: OTLPData = {
    traces: [
      {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
        operationName: 'test-operation',
        startTime: Date.now() * 1000000,
        endTime: (Date.now() + 1000) * 1000000,
        duration: 1000 * 1000000,
        serviceName: 'test-service',
        statusCode: 0,
        spanKind: 'SPAN_KIND_INTERNAL',
        attributes: {},
        resourceAttributes: {},
        events: [],
        links: []
      }
    ],
    timestamp: Date.now()
  }

  it('should pass JSON encoding type to storage layer', async () => {
    let capturedEncodingType: string | undefined

    const testLayer = Layer.effect(
      StorageAPIClientTag,
      Effect.succeed({
        writeOTLP: (data: OTLPData, encodingType?: 'protobuf' | 'json') => {
          capturedEncodingType = encodingType
          return Effect.succeed(undefined)
        },
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: () => Effect.succeed([]),
        insertRaw: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: false })
      })
    )

    const effect = Effect.gen(function* () {
      const storage = yield* StorageAPIClientTag
      yield* storage.writeOTLP(testData, 'json')
    })

    await Effect.runPromise(Effect.provide(effect, testLayer))
    
    expect(capturedEncodingType).toBe('json')
  })

  it('should pass protobuf encoding type to storage layer', async () => {
    let capturedEncodingType: string | undefined

    const testLayer = Layer.effect(
      StorageAPIClientTag,
      Effect.succeed({
        writeOTLP: (data: OTLPData, encodingType?: 'protobuf' | 'json') => {
          capturedEncodingType = encodingType
          return Effect.succeed(undefined)
        },
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: () => Effect.succeed([]),
        insertRaw: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: false })
      })
    )

    const effect = Effect.gen(function* () {
      const storage = yield* StorageAPIClientTag
      yield* storage.writeOTLP(testData, 'protobuf')
    })

    await Effect.runPromise(Effect.provide(effect, testLayer))
    
    expect(capturedEncodingType).toBe('protobuf')
  })

  it('should default to protobuf when no encoding type specified', async () => {
    let capturedEncodingType: string | undefined = 'not-set'

    const testLayer = Layer.effect(
      StorageAPIClientTag,
      Effect.succeed({
        writeOTLP: (data: OTLPData, encodingType: 'protobuf' | 'json' = 'protobuf') => {
          capturedEncodingType = encodingType
          return Effect.succeed(undefined)
        },
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: () => Effect.succeed([]),
        insertRaw: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: false })
      })
    )

    const effect = Effect.gen(function* () {
      const storage = yield* StorageAPIClientTag
      yield* storage.writeOTLP(testData) // No encoding type specified
    })

    await Effect.runPromise(Effect.provide(effect, testLayer))
    
    expect(capturedEncodingType).toBe('protobuf')
  })

  it('should validate OTLP data before passing to storage', async () => {
    const invalidData: OTLPData = {
      // Missing required fields
      timestamp: Date.now()
    }

    // Create a test layer with actual validation
    const testConfig = {
      host: 'localhost',
      port: 8123,
      database: 'otel',
      username: 'otel',
      password: 'otel123'
    }
    
    const testLayer = StorageAPIClientLayer.pipe(
      Layer.provide(Layer.succeed(ClickHouseConfigTag, testConfig))
    )

    const effect = Effect.gen(function* () {
      const storage = yield* StorageAPIClientTag
      yield* storage.writeOTLP(invalidData, 'json')
    })

    const result = await Effect.runPromiseExit(Effect.provide(effect, testLayer))
    
    // Should fail validation
    expect(Exit.isFailure(result)).toBe(true)
  })
})