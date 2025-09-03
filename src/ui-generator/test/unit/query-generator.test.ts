import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import {
  CriticalPath,
  QueryPattern,
  CriticalPathQueryGeneratorTag,
  CriticalPathQueryGeneratorLive,
  patterns
} from "../../query-generator"
import { StorageAPIClientTag } from "../../../storage/api-client"

// Test data
const testPath: CriticalPath = {
  id: "test-path-1",
  name: "Frontend to Database",
  services: ["frontend", "api-gateway", "payment-service", "database"],
  startService: "frontend",
  endService: "database",
  metadata: {
    criticality: "high"
  }
}

describe("Query Pattern Generation", () => {
  describe("Service Latency Query", () => {
    it("should generate correct SQL for service latency analysis", () => {
      const query = patterns.generateServiceLatencyQuery(testPath, 30)
      
      expect(query.id).toBe("test-path-1_latency")
      expect(query.pattern).toBe(QueryPattern.SERVICE_LATENCY)
      expect(query.sql).toContain("quantile(0.5)")
      expect(query.sql).toContain("quantile(0.95)")
      expect(query.sql).toContain("quantile(0.99)")
      expect(query.sql).toContain("'frontend', 'api-gateway', 'payment-service', 'database'")
      expect(query.sql).toContain("INTERVAL 30 MINUTE")
    })
    
    it("should include expected schema", () => {
      const query = patterns.generateServiceLatencyQuery(testPath)
      
      expect(query.expectedSchema).toEqual({
        service_name: "String",
        minute: "DateTime",
        p50_ms: "Float64",
        p95_ms: "Float64",
        p99_ms: "Float64",
        request_count: "UInt64"
      })
    })
  })
  
  describe("Error Distribution Query", () => {
    it("should generate correct SQL for error distribution", () => {
      const query = patterns.generateErrorDistributionQuery(testPath, 60)
      
      expect(query.id).toBe("test-path-1_errors")
      expect(query.pattern).toBe(QueryPattern.ERROR_DISTRIBUTION)
      expect(query.sql).toContain("status_code != 'OK'")
      expect(query.sql).toContain("error_percentage")
      expect(query.sql).toContain("GROUP BY service_name, status_code, status_message")
    })
  })
  
  describe("Bottleneck Detection Query", () => {
    it("should generate correct SQL for bottleneck detection", () => {
      const query = patterns.generateBottleneckQuery(testPath)
      
      expect(query.id).toBe("test-path-1_bottleneck")
      expect(query.pattern).toBe(QueryPattern.BOTTLENECK_DETECTION)
      expect(query.sql).toContain("operation_name")
      expect(query.sql).toContain("HAVING p95_ms > 100")
      expect(query.sql).toContain("ORDER BY p95_ms DESC")
    })
  })
  
  describe("Volume Throughput Query", () => {
    it("should generate correct SQL for volume analysis", () => {
      const query = patterns.generateVolumeThroughputQuery(testPath)
      
      expect(query.id).toBe("test-path-1_volume")
      expect(query.pattern).toBe(QueryPattern.VOLUME_THROUGHPUT)
      expect(query.sql).toContain("requests_per_minute")
      expect(query.sql).toContain("requests_per_second")
      expect(query.sql).toContain("success_rate")
    })
  })
  
  describe("Time Comparison Query", () => {
    it("should generate correct SQL for time comparison", () => {
      const query = patterns.generateTimeComparisonQuery(testPath, 30)
      
      expect(query.id).toBe("test-path-1_comparison")
      expect(query.pattern).toBe(QueryPattern.TIME_COMPARISON)
      expect(query.sql).toContain("WITH current_period")
      expect(query.sql).toContain("previous_period")
      expect(query.sql).toContain("p95_change_percent")
      expect(query.sql).toContain("INTERVAL 30 MINUTE")
      expect(query.sql).toContain("INTERVAL 60 MINUTE")
    })
  })
  
  describe("Generate All Patterns", () => {
    it("should generate all 5 query patterns", () => {
      const queries = patterns.generateAllPatternQueries(testPath)
      
      expect(queries).toHaveLength(5)
      
      const patternTypes = queries.map(q => q.pattern)
      expect(patternTypes).toContain(QueryPattern.SERVICE_LATENCY)
      expect(patternTypes).toContain(QueryPattern.ERROR_DISTRIBUTION)
      expect(patternTypes).toContain(QueryPattern.BOTTLENECK_DETECTION)
      expect(patternTypes).toContain(QueryPattern.VOLUME_THROUGHPUT)
      expect(patternTypes).toContain(QueryPattern.TIME_COMPARISON)
    })
  })
})

describe("CriticalPathQueryGenerator Service", () => {
  // Create mock StorageAPIClient for testing
  const mockStorageAPIClient = Layer.succeed(
    StorageAPIClientTag,
    {
      writeOTLP: () => Effect.succeed(undefined),
      queryTraces: () => Effect.succeed([]),
      queryMetrics: () => Effect.succeed([]),
      queryLogs: () => Effect.succeed([]),
      queryAI: () => Effect.succeed([]),
      queryRaw: () => Effect.succeed([
        { service_name: "frontend", p95_ms: 123.45, request_count: 1000 },
        { service_name: "backend", p95_ms: 234.56, request_count: 2000 }
      ]),
      healthCheck: () => Effect.succeed({ clickhouse: true, s3: true })
    }
  )
  
  const testLayer = Layer.provide(
    CriticalPathQueryGeneratorLive,
    mockStorageAPIClient
  )
  
  describe("generateQueries", () => {
    it("should generate queries with thunks", async () => {
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorTag
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        expect(queries).toHaveLength(5)
        
        // Check that each query has a thunk
        for (const query of queries) {
          expect(query.executeThunk).toBeDefined()
          expect(typeof query.executeThunk).toBe("function")
        }
        
        return queries
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      expect(result).toBeDefined()
    })
    
    it("should execute thunks lazily", async () => {
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorTag
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        // Execute the first query's thunk
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        const result = yield* firstQuery.executeThunk()
        
        expect(result.queryId).toBe(firstQuery.id)
        expect(result.data).toBeDefined()
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
        expect(result.rowCount).toBeGreaterThanOrEqual(0)
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      expect(result.data).toHaveLength(2) // Mock returns 2 rows
    })
  })
  
  describe("generateQueryThunk", () => {
    it("should generate thunk for specific pattern", async () => {
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorTag
        const thunk = yield* queryGenerator.generateQueryThunk(
          testPath,
          QueryPattern.SERVICE_LATENCY
        )
        
        expect(thunk).toBeDefined()
        expect(typeof thunk).toBe("function")
        
        // Execute the thunk
        const result = yield* thunk()
        
        expect(result.queryId).toContain("latency")
        expect(result.data).toBeDefined()
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      expect(result).toBeDefined()
    })
    
    it("should handle unknown pattern", async () => {
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorTag
        const thunk = yield* queryGenerator.generateQueryThunk(
          testPath,
          "UNKNOWN_PATTERN" as QueryPattern
        )
        
        return thunk
      })
      
      await expect(
        Effect.runPromise(Effect.provide(program, testLayer))
      ).rejects.toThrow("Unknown query pattern")
    })
  })
  
  describe("Thunk Error Handling", () => {
    it("should handle execution errors gracefully", async () => {
      // Create a layer with failing storage
      const failingStorage = Layer.succeed(
        StorageAPIClientTag,
        {
          writeOTLP: () => Effect.succeed(undefined),
          queryTraces: () => Effect.succeed([]),
          queryMetrics: () => Effect.succeed([]),
          queryLogs: () => Effect.succeed([]),
          queryAI: () => Effect.succeed([]),
          queryRaw: () => Effect.fail({ _tag: 'QueryError', message: "Database connection failed", query: "SELECT * FROM traces", cause: new Error("Database connection failed") } as const),
          healthCheck: () => Effect.succeed({ clickhouse: false, s3: false })
        }
      )
      
      const failingLayer = Layer.provide(
        CriticalPathQueryGeneratorLive,
        failingStorage
      )
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorTag
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        // Execute a thunk that will fail
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        const result = yield* firstQuery.executeThunk()
        
        // Should return error in result, not throw
        expect(result.error).toBe("Database connection failed")
        expect(result.data).toEqual([])
        expect(result.rowCount).toBe(0)
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, failingLayer)
      )
      
      expect(result.error).toBeDefined()
    })
  })
})

describe("SQL Injection Prevention", () => {
  it("should properly escape service names", () => {
    const maliciousPath: CriticalPath = {
      id: "malicious",
      name: "Test",
      services: ["frontend'; DROP TABLE traces; --"],
      startService: "frontend",
      endService: "backend"
    }
    
    const query = patterns.generateServiceLatencyQuery(maliciousPath)
    
    // Check that the SQL properly escapes the single quote
    expect(query.sql).toContain("'frontend''; DROP TABLE traces; --'")
    // The dangerous SQL should be escaped and within quotes
    expect(query.sql).not.toContain("'frontend'; DROP TABLE traces; --'")
  })
})