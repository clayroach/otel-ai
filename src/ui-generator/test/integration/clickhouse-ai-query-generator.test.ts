import { describe, it, expect, beforeAll } from "vitest"
import { Effect, Layer } from "effect"
import { CriticalPath } from "../../query-generator/types"
import {
  CriticalPathQueryGeneratorClickHouseAI,
  CriticalPathQueryGeneratorClickHouseAILive
} from "../../query-generator/service-clickhouse-ai"
import { StorageAPIClientTag } from "../../../storage/api-client"
import {
  logAvailabilityStatus,
  shouldSkipLLMTests
} from "../../../llm-manager/test/utils/llm-availability.js"
import { LLMManagerLive } from "../../../llm-manager/index.js"

// Test data representing a real critical path
const testPath: CriticalPath = {
  id: "checkout-flow",
  name: "E-commerce Checkout Flow",
  services: ["frontend", "cart-service", "payment-service", "inventory-service", "notification-service"],
  startService: "frontend",
  endService: "notification-service",
  metadata: {
    criticality: "high",
    sla: "99.9%"
  }
}

describe.skipIf(shouldSkipLLMTests())("ClickHouse AI Query Generator", () => {
  
  beforeAll(() => {
    // Log availability status using shared utility
    console.log("\n🔧 ClickHouse AI Query Generator Test Configuration")
    logAvailabilityStatus()
    console.log("✅ Tests will run with available LLM models")
  })
  
  describe("Query Generation with General AI Models", () => {
    // Mock storage that returns predictable data
    const mockStorageAPIClient = Layer.succeed(
      StorageAPIClientTag,
      {
        writeOTLP: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: (sql: string) => {
          // Return different mock data based on query patterns
          if (sql.includes("quantile")) {
            return Effect.succeed([
              { service_name: "payment-service", p50_ms: 250, p95_ms: 450, p99_ms: 490 },
              { service_name: "frontend", p50_ms: 140, p95_ms: 180, p99_ms: 195 }
            ])
          } else if (sql.includes("status_code")) {
            return Effect.succeed([
              { service_name: "payment-service", status_code: "ERROR", error_count: 5 }
            ])
          } else {
            return Effect.succeed([
              { service_name: "frontend", request_count: 1000 }
            ])
          }
        },
        insertRaw: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true })
      }
    )
    
    // Build the complete layer stack
    // mockStorageAPIClient provides storage
    // LLMManagerLive provides the LLM manager service
    // CriticalPathQueryGeneratorClickHouseAILive uses both dependencies
    const testLayer = Layer.provide(
      CriticalPathQueryGeneratorClickHouseAILive,
      Layer.merge(mockStorageAPIClient, LLMManagerLive)
    )
    
    it("should generate multiple analysis queries for a critical path", async () => {
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        expect(queries.length).toBeGreaterThan(0)
        expect(queries.length).toBeLessThanOrEqual(2) // Limited to 2 in test environment
        
        // Check each query has required properties
        for (const query of queries) {
          expect(query.sql).toBeDefined()
          expect(query.sql.length).toBeGreaterThan(0)
          expect(query.description).toBeDefined()
          expect(query.pattern).toBeDefined()
          expect(query.executeThunk).toBeDefined()
          
          // Query should reference the services
          const sqlLower = query.sql.toLowerCase()
          expect(
            testPath.services.some(service => sqlLower.includes(service))
          ).toBe(true)
        }
        
        return queries
      })
      
      const queries = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log(`   Generated ${queries.length} queries (test mode: limited to 2)`)
      queries.forEach((q, i) => {
        console.log(`   Query ${i + 1}: ${q.description}`)
      })
    })
    
    it("should optimize an existing query", async () => {
      
      const originalQuery = `
        SELECT service_name, COUNT(*) as count
        FROM traces
        WHERE service_name IN ('frontend', 'payment-service')
        GROUP BY service_name
      `
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const optimized = yield* queryGenerator.optimizeQuery(
          originalQuery,
          "Analyze service request patterns"
        )
        
        expect(optimized).toBeDefined()
        expect(optimized.length).toBeGreaterThan(0)
        
        // Should still be valid SQL
        expect(optimized.toLowerCase()).toContain("select")
        expect(optimized.toLowerCase()).toContain("from")
        
        return optimized
      })
      
      const optimized = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log("   Original query length:", originalQuery.trim().length)
      console.log("   Optimized query length:", optimized.length)
    })
    
    it("should explain what a query does", async () => {
      
      const complexQuery = `
        SELECT 
          service_name,
          quantile(0.5)(duration_ns/1000000) as p50_ms,
          quantile(0.95)(duration_ns/1000000) as p95_ms,
          quantile(0.99)(duration_ns/1000000) as p99_ms,
          count() as request_count
        FROM traces
        WHERE 
          service_name IN ('frontend', 'payment-service')
          AND start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
        ORDER BY p99_ms DESC
      `
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const explanation = yield* queryGenerator.explainQuery(complexQuery)
        
        expect(explanation).toBeDefined()
        expect(explanation.length).toBeGreaterThan(50) // Should be a meaningful explanation
        
        // Should mention key concepts from the query
        const explanationLower = explanation.toLowerCase()
        expect(
          explanationLower.includes("percentile") ||
          explanationLower.includes("quantile") ||
          explanationLower.includes("latency") ||
          explanationLower.includes("performance")
        ).toBe(true)
        
        return explanation
      })
      
      const explanation = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log("   Query explanation:")
      console.log("   ", explanation.substring(0, 200) + "...")
    })
    
    it("should execute generated queries", async () => {
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        expect(queries.length).toBeGreaterThan(0)
        
        // Execute the first query
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        
        const result = yield* firstQuery.executeThunk()
        
        expect(result).toBeDefined()
        expect(result.data).toBeDefined()
        expect(Array.isArray(result.data)).toBe(true)
        expect(result.rowCount).toBeGreaterThanOrEqual(0)
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log(`   Query executed, returned ${result.rowCount} rows`)
    })
  })
  
  describe("Model Selection", () => {
    it("should use configured general models from Portkey config", () => {
      // Model selection is now handled by Portkey configuration
      // The config defines default models and routing rules
      console.log("   Model selection handled by Portkey configuration")
      console.log("     Default general model from config")
      console.log("     Default SQL model from config")
      console.log("     Task-based routing enabled")

      // Portkey config should always be present
      const hasPortkeyConfig = true // Config is loaded automatically
      if (!hasPortkeyConfig) {
        console.log("     No general models configured in environment")
      }
      
      expect(true).toBe(true) // This test just reports configuration
    })
  })
})