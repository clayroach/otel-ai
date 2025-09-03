import { Effect, Context, Layer, pipe } from "effect"
import { 
  CriticalPath,
  CriticalPathQueryGenerator,
  GeneratedQueryWithThunk,
  QueryPattern,
  QueryThunk,
  QueryResult
} from "./types"
import * as patterns from "./patterns"
import { StorageAPIClientTag } from "../../storage/api-client"
import { StorageError } from "../../storage/errors"

// CriticalPathQueryGenerator implementation
export const make = Effect.gen(function* () {
  const storage = yield* StorageAPIClientTag
  
  // Create a thunk for lazy query execution
  const createQueryThunk = (queryId: string, sql: string): QueryThunk => {
    return () => pipe(
      Effect.gen(function* () {
        const startTime = Date.now()
        const result = yield* storage.queryRaw(sql)
        const executionTimeMs = Date.now() - startTime
        
        return {
          queryId,
          data: result as Array<Record<string, unknown>>,
          executionTimeMs,
          rowCount: result.length,
          error: undefined
        } satisfies QueryResult
      }),
      Effect.catchAll((error: StorageError) => 
        Effect.succeed({
          queryId,
          data: [],
          executionTimeMs: 0,
          rowCount: 0,
          error: error._tag === 'QueryError' ? error.message : `Storage error: ${error._tag}`
        } satisfies QueryResult)
      )
    )
  }
  
  // Generate queries for a critical path
  const generateQueries = (path: CriticalPath): Effect.Effect<GeneratedQueryWithThunk[], Error, never> => {
    return Effect.succeed(
      patterns.generateAllPatternQueries(path).map(query => ({
        ...query,
        executeThunk: createQueryThunk(query.id, query.sql)
      }))
    )
  }
  
  // Generate a specific query pattern thunk
  const generateQueryThunk = (path: CriticalPath, pattern: QueryPattern): Effect.Effect<QueryThunk, Error, never> => {
    return Effect.gen(function* () {
      let query
      
      switch (pattern) {
        case QueryPattern.SERVICE_LATENCY:
          query = patterns.generateServiceLatencyQuery(path)
          break
        case QueryPattern.ERROR_DISTRIBUTION:
          query = patterns.generateErrorDistributionQuery(path)
          break
        case QueryPattern.BOTTLENECK_DETECTION:
          query = patterns.generateBottleneckQuery(path)
          break
        case QueryPattern.VOLUME_THROUGHPUT:
          query = patterns.generateVolumeThroughputQuery(path)
          break
        case QueryPattern.TIME_COMPARISON:
          query = patterns.generateTimeComparisonQuery(path)
          break
        default:
          return yield* Effect.fail(new Error(`Unknown query pattern: ${pattern}`))
      }
      
      return createQueryThunk(query.id, query.sql)
    })
  }
  
  return {
    generateQueries,
    generateQueryThunk
  } satisfies CriticalPathQueryGenerator
})

// Create the service tag
export const CriticalPathQueryGeneratorTag = Context.GenericTag<CriticalPathQueryGenerator>("CriticalPathQueryGenerator")

// Create the live layer - requires StorageAPIClient
export const CriticalPathQueryGeneratorLive = Layer.effect(
  CriticalPathQueryGeneratorTag,
  make
)