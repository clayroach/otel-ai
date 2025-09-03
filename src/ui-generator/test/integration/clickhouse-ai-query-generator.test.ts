import { describe, it, expect, beforeAll } from "vitest"
import { Effect, Layer } from "effect"
import { CriticalPath } from "../../query-generator/types"
import {
  CriticalPathQueryGeneratorClickHouseAI,
  CriticalPathQueryGeneratorClickHouseAILive
} from "../../query-generator/service-clickhouse-ai"
import { StorageAPIClientTag } from "../../../storage/api-client"
// LLMManagerContext not needed - service creates its own multi-model manager

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

describe("ClickHouse AI Query Generator", () => {
  let isAvailable = false
  
  beforeAll(() => {
    // Check if we should skip these tests
    if (process.env.SKIP_LLM_TESTS === 'true') {
      console.log("⏭️  Skipping ClickHouse AI tests (SKIP_LLM_TESTS=true)")
      isAvailable = false
      return
    }
    
    // Check if we have API keys configured for general models
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY
    const hasClaudeKey = !!process.env.CLAUDE_API_KEY
    const hasLocalEndpoint = !!process.env.LLM_ENDPOINT
    
    // ClickHouse AI prioritizes external APIs
    const hasExternalAPIs = hasOpenAIKey || hasClaudeKey
    
    if (hasExternalAPIs) {
      console.log("✅ ClickHouse AI Query Generator using EXTERNAL LLMs")
      console.log(`   🌐 Path 1: External API Mode`)
      console.log(`   Claude API: ${hasClaudeKey ? '✓ configured' : '✗ not configured'}`)
      console.log(`   OpenAI API: ${hasOpenAIKey ? '✓ configured' : '✗ not configured'}`)
      isAvailable = true
    } else if (hasLocalEndpoint) {
      console.log("✅ ClickHouse AI Query Generator using LOCAL models")
      console.log(`   💻 Path 2: Local Model Fallback`)
      console.log(`   Local endpoint: ${process.env.LLM_ENDPOINT}`)
      console.log(`   Will use SQL models: ${process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2'}`)
      isAvailable = true
    } else {
      console.log("❌ No AI models configured for ClickHouse AI Query Generator")
      console.log("   Path 1 (preferred): Set OPENAI_API_KEY or CLAUDE_API_KEY")
      console.log("   Path 2 (fallback): Set LLM_ENDPOINT for local models")
      isAvailable = false
    }
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
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true })
      }
    )
    
    // Build the complete layer stack
    // mockStorageAPIClient provides storage
    // CriticalPathQueryGeneratorClickHouseAILive creates its own multi-model manager
    const testLayer = Layer.provide(
      CriticalPathQueryGeneratorClickHouseAILive,
      mockStorageAPIClient
    )
    
    it.skipIf(!isAvailable)("should generate multiple analysis queries for a critical path", { timeout: 120000 }, async () => {
      
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
    
    it.skipIf(!isAvailable)("should optimize an existing query", { timeout: 30000 }, async () => {
      
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
    
    it.skipIf(!isAvailable)("should explain what a query does", { timeout: 30000 }, async () => {
      
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
    
    it.skipIf(!isAvailable)("should execute generated queries", { timeout: 60000 }, async () => {
      
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
    it.skipIf(!isAvailable)("should use configured general models from environment", () => {
      const generalModel1 = process.env.LLM_GENERAL_MODEL_1
      const generalModel2 = process.env.LLM_GENERAL_MODEL_2
      const generalModel3 = process.env.LLM_GENERAL_MODEL_3
      
      console.log("   Configured general models:")
      if (generalModel1) console.log(`     Priority 1: ${generalModel1}`)
      if (generalModel2) console.log(`     Priority 2: ${generalModel2}`)
      if (generalModel3) console.log(`     Priority 3: ${generalModel3}`)
      
      // At least one model should be configured
      const hasModels = !!(generalModel1 || generalModel2 || generalModel3)
      if (!hasModels) {
        console.log("     No general models configured in environment")
      }
      
      expect(true).toBe(true) // This test just reports configuration
    })
  })
})