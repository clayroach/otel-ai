import { Effect, Context, Layer, pipe } from "effect"
import { 
  CriticalPath,
  CriticalPathQueryGenerator,
  GeneratedQueryWithThunk,
  QueryPattern,
  QueryThunk,
  QueryResult
} from "./types"
import { StorageAPIClientTag } from "../../storage/api-client"
import { StorageError } from "../../storage/errors"
import { generateQueryWithLLM, generateStandardQueries, ANALYSIS_GOALS } from "./llm-query-generator"

// CriticalPathQueryGenerator implementation using LLM
export const makeLLMBased = Effect.gen(function* () {
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
  
  // Generate queries using LLM for a critical path
  const generateQueries = (path: CriticalPath): Effect.Effect<GeneratedQueryWithThunk[], Error, never> => {
    return pipe(
      generateStandardQueries(path),
      Effect.map(queries => 
        queries.map(query => ({
          ...query,
          executeThunk: createQueryThunk(query.id, query.sql)
        }))
      )
    )
  }
  
  // Generate a specific query using LLM based on pattern
  const generateQueryThunk = (path: CriticalPath, pattern: QueryPattern): Effect.Effect<QueryThunk, Error, never> => {
    // Map pattern to analysis goal
    const patternToGoal: Record<QueryPattern, string> = {
      [QueryPattern.SERVICE_LATENCY]: ANALYSIS_GOALS.latency,
      [QueryPattern.ERROR_DISTRIBUTION]: ANALYSIS_GOALS.errors,
      [QueryPattern.BOTTLENECK_DETECTION]: ANALYSIS_GOALS.bottlenecks,
      [QueryPattern.VOLUME_THROUGHPUT]: ANALYSIS_GOALS.throughput,
      [QueryPattern.TIME_COMPARISON]: ANALYSIS_GOALS.comparison
    }
    
    const analysisGoal = patternToGoal[pattern]
    if (!analysisGoal) {
      return Effect.fail(new Error(`Unknown query pattern: ${pattern}`))
    }
    
    return pipe(
      generateQueryWithLLM(path, analysisGoal),
      Effect.map(query => createQueryThunk(query.id, query.sql))
    )
  }
  
  return {
    generateQueries,
    generateQueryThunk
  } satisfies CriticalPathQueryGenerator
})

// Create the service tag
export const CriticalPathQueryGeneratorLLMTag = Context.GenericTag<CriticalPathQueryGenerator>("CriticalPathQueryGeneratorLLM")

// Create the LLM-based live layer
export const CriticalPathQueryGeneratorLLMLive = Layer.effect(
  CriticalPathQueryGeneratorLLMTag,
  makeLLMBased
)

// Helper to create a generator with custom analysis goal
export const generateCustomQuery = (
  path: CriticalPath,
  analysisGoal: string,
  storage: ReturnType<typeof StorageAPIClientTag["Type"]>
): Effect.Effect<GeneratedQueryWithThunk, Error, never> => {
  return pipe(
    generateQueryWithLLM(path, analysisGoal),
    Effect.map(query => ({
      ...query,
      executeThunk: () => pipe(
        Effect.gen(function* () {
          const startTime = Date.now()
          const result = yield* storage.queryRaw(query.sql)
          const executionTimeMs = Date.now() - startTime
          
          return {
            queryId: query.id,
            data: result as Array<Record<string, unknown>>,
            executionTimeMs,
            rowCount: result.length,
            error: undefined
          } satisfies QueryResult
        }),
        Effect.catchAll((error: StorageError) => 
          Effect.succeed({
            queryId: query.id,
            data: [],
            executionTimeMs: 0,
            rowCount: 0,
            error: error._tag === 'QueryError' ? error.message : `Storage error: ${error._tag}`
          } satisfies QueryResult)
        )
      )
    }))
  )
}