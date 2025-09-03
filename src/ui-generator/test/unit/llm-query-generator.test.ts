import { describe, it, expect, beforeAll } from "vitest"
import { Effect, Layer } from "effect"
import { CriticalPath } from "../../query-generator/types"
import {
  CriticalPathQueryGeneratorLLMTag,
  CriticalPathQueryGeneratorLLMLive
} from "../../query-generator/service-llm"
import { generateQueryWithLLM, ANALYSIS_GOALS, validateGeneratedSQL } from "../../query-generator/llm-query-generator"
import { StorageAPIClientTag } from "../../../storage/api-client"
import { createSimpleLLMManager } from "../../../llm-manager/simple-manager"

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

describe("LLM Query Generator", () => {
  let llmAvailable = false
  let llmDetails: {
    endpoint?: string
    model?: string
    status?: string
    error?: string
  } = {}
  
  beforeAll(async () => {
    console.log("🔍 Checking LLM availability...")
    
    const endpoint = process.env.LLM_ENDPOINT || "http://localhost:1234/v1"
    
    try {
      // First, fetch available models from the /models endpoint
      console.log(`   Fetching models from: ${endpoint}/models`)
      
      const modelsResponse = await fetch(`${endpoint}/models`)
      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch models: ${modelsResponse.status} ${modelsResponse.statusText}`)
      }
      
      const modelsData = await modelsResponse.json()
      const availableModels = modelsData.data || []
      
      if (availableModels.length === 0) {
        throw new Error("No models available at endpoint")
      }
      
      console.log(`   Found ${availableModels.length} available models:`)
      availableModels.forEach((model: { id: string; object: string }) => {
        console.log(`     - ${model.id} (${model.object})`)
      })
      
      // Select the first appropriate model for testing
      const selectedModel = availableModels[0]
      console.log(`   Selected model for testing: ${selectedModel.id}`)
      
      // Try to actually generate a simple test query to verify the LLM is working
      const llmManager = createSimpleLLMManager({
        models: {
          llama: {
            endpoint,
            modelPath: selectedModel.id,
            contextLength: 4096,
            threads: 4
          }
        }
      })
      
      // Try a real generation request with a simple prompt
      const testRequest = {
        prompt: "Respond with just 'OK' if you are working",
        taskType: "general" as const,
        preferences: {
          model: "llama" as const,
          maxTokens: 50,  // Increased from 10 to avoid hitting token limit
          temperature: 0
        }
      }
      
      console.log(`   Sending test request to model ${selectedModel.id}...`)
      
      // Log the actual request being sent
      console.log(`   Request details:`, JSON.stringify(testRequest, null, 2))
      
      const testResponse = await Effect.runPromise(
        llmManager.generate(testRequest).pipe(
          Effect.timeout("10 seconds"),
          Effect.catchAll((error) => {
            console.log(`   Request failed:`, error)
            return Effect.fail(new Error("LLM request timed out or failed"))
          })
        )
      )
      
      console.log(`   Response received:`, JSON.stringify(testResponse, null, 2))
      
      if (testResponse && testResponse.content) {
        llmAvailable = true
        
        llmDetails = {
          endpoint,
          model: selectedModel.id,
          status: "healthy"
        }
        
        console.log("✅ LLM is available and responding:")
        console.log(`   Endpoint: ${llmDetails.endpoint}`)
        console.log(`   Active Model: ${llmDetails.model}`)
        console.log(`   Available Models: ${availableModels.map((m: { id: string }) => m.id).join(", ")}`)
        console.log(`   Test response: ${testResponse.content.substring(0, 50)}`)
      } else {
        throw new Error("LLM returned empty response")
      }
    } catch (error) {
      llmAvailable = false
      llmDetails = {
        endpoint,
        status: "unavailable",
        error: error instanceof Error ? error.message : String(error)
      }
      console.log("❌ LLM is not available:")
      console.log(`   Endpoint: ${endpoint}`)
      console.log(`   Error: ${llmDetails.error}`)
      console.log("   Tests requiring LLM will be skipped")
    }
  })
  
  describe("LLM Availability", () => {
    it("should report LLM status", () => {
      console.log("\n📊 LLM Status Report:")
      console.log(`   Available: ${llmAvailable}`)
      console.log(`   Details: ${JSON.stringify(llmDetails, null, 2)}`)
      
      // This test always passes - it's just for reporting
      expect(llmDetails).toBeDefined()
    })
  })
  
  describe("Query Generation with Real LLM", () => {
    it("should generate valid SQL for latency analysis", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      expect(query.sql).toBeDefined()
      expect(query.description).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Check that it includes the actual service names
      expect(query.sql).toContain("frontend")
      expect(query.sql).toContain("payment-service")
      
      // Should have latency-specific elements
      expect(query.sql.toLowerCase()).toContain("quantile")
      expect(query.sql.toLowerCase()).toContain("duration_ns")
    })
    
    it("should generate valid SQL for error analysis", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors)
      )
      
      expect(query.sql).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Should have error-specific elements
      expect(query.sql).toContain("status_code")
      expect(query.sql.toUpperCase()).toContain("!= 'OK'")
    })
    
    it("should generate deterministic queries for same input", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      console.log("\n🔄 Testing determinism with temperature=0...")
      
      // Generate the same query 3 times
      const query1 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const query2 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const query3 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      // All should be valid
      expect(validateGeneratedSQL(query1.sql)).toBe(true)
      expect(validateGeneratedSQL(query2.sql)).toBe(true)
      expect(validateGeneratedSQL(query3.sql)).toBe(true)
      
      // All should contain the same key elements
      const requiredElements = [
        "quantile(0.5)",
        "quantile(0.95)",
        "quantile(0.99)",
        "duration_ns",
        "service_name",
        "frontend",
        "payment-service"
      ]
      
      for (const element of requiredElements) {
        expect(query1.sql).toContain(element)
        expect(query2.sql).toContain(element)
        expect(query3.sql).toContain(element)
      }
      
      // Check structural similarity
      const countClauses = (sql: string) => ({
        select: (sql.match(/SELECT/gi) || []).length,
        from: (sql.match(/FROM/gi) || []).length,
        where: (sql.match(/WHERE/gi) || []).length,
        groupBy: (sql.match(/GROUP BY/gi) || []).length
      })
      
      const structure1 = countClauses(query1.sql)
      const structure2 = countClauses(query2.sql)
      const structure3 = countClauses(query3.sql)
      
      console.log("   Query 1 structure:", structure1)
      console.log("   Query 2 structure:", structure2)
      console.log("   Query 3 structure:", structure3)
      
      // Structures should be identical
      expect(structure1).toEqual(structure2)
      expect(structure2).toEqual(structure3)
    })
    
    it("should generate different queries for different analysis goals", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const latencyQuery = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const errorQuery = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors)
      )
      
      const bottleneckQuery = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.bottlenecks)
      )
      
      // All should be valid
      expect(validateGeneratedSQL(latencyQuery.sql)).toBe(true)
      expect(validateGeneratedSQL(errorQuery.sql)).toBe(true)
      expect(validateGeneratedSQL(bottleneckQuery.sql)).toBe(true)
      
      // Each should have different characteristics
      expect(latencyQuery.sql).toContain("quantile")
      expect(errorQuery.sql.toUpperCase()).toContain("!= 'OK'")
      expect(bottleneckQuery.sql.toLowerCase()).toContain("operation")
      
      // SQLs should be different
      expect(latencyQuery.sql).not.toEqual(errorQuery.sql)
      expect(errorQuery.sql).not.toEqual(bottleneckQuery.sql)
    })
    
    it("should handle custom analysis goals", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const customGoal = "Analyze the relationship between service latency and error rates, focusing on correlation patterns during peak load"
      
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, customGoal)
      )
      
      expect(query.sql).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      expect(query.description).toBeDefined()
      
      console.log("\n📝 Custom goal query generated:")
      console.log(`   Goal: ${customGoal.substring(0, 50)}...`)
      console.log(`   Description: ${query.description}`)
    })
    
    it("should properly escape service names to prevent SQL injection", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const maliciousPath: CriticalPath = {
        ...testPath,
        services: ["frontend'; DROP TABLE traces; --", "backend"]
      }
      
      const query = await Effect.runPromise(
        generateQueryWithLLM(maliciousPath, ANALYSIS_GOALS.latency)
      )
      
      // The service name should be escaped
      expect(query.sql).toContain("frontend''") // Escaped quote
      expect(query.sql).not.toContain("DROP TABLE")
      expect(validateGeneratedSQL(query.sql)).toBe(true)
    })
  })
  
  describe("Integration with Storage Layer", () => {
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
          if (sql.includes("status_code != 'OK'")) {
            return Effect.succeed([
              { service_name: "payment-service", status_code: "ERROR", error_count: 5 }
            ])
          } else if (sql.includes("quantile")) {
            return Effect.succeed([
              { service_name: "payment-service", p50_ms: 250, p95_ms: 450, p99_ms: 490 },
              { service_name: "frontend", p50_ms: 140, p95_ms: 180, p99_ms: 195 }
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
    
    const testLayer = Layer.provide(
      CriticalPathQueryGeneratorLLMLive,
      mockStorageAPIClient
    )
    
    it("should execute generated queries and return results", { timeout: 60000 }, async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorLLMTag
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        expect(queries.length).toBeGreaterThan(0)
        
        // Execute the first query
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        
        const result = yield* firstQuery.executeThunk()
        
        expect(result.data).toBeDefined()
        expect(result.rowCount).toBeGreaterThanOrEqual(0)
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
        expect(result.error).toBeUndefined()
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      expect(result).toBeDefined()
    })
    
    it("should handle query execution errors gracefully", { timeout: 60000 }, async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const failingStorage = Layer.succeed(
        StorageAPIClientTag,
        {
          writeOTLP: () => Effect.succeed(undefined),
          queryTraces: () => Effect.succeed([]),
          queryMetrics: () => Effect.succeed([]),
          queryLogs: () => Effect.succeed([]),
          queryAI: () => Effect.succeed([]),
          queryRaw: () => Effect.fail({ 
            _tag: 'QueryError' as const, 
            message: "ClickHouse connection failed", 
            query: "SELECT * FROM traces",
            cause: new Error("Network timeout")
          }),
          healthCheck: () => Effect.succeed({ clickhouse: false, s3: false })
        }
      )
      
      const failingLayer = Layer.provide(
        CriticalPathQueryGeneratorLLMLive,
        failingStorage
      )
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorLLMTag
        const queries = yield* queryGenerator.generateQueries(testPath)
        
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        
        const result = yield* firstQuery.executeThunk()
        
        // Should return error in result, not throw
        expect(result.error).toBeDefined()
        expect(result.error).toContain("ClickHouse connection failed")
        expect(result.data).toEqual([])
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, failingLayer)
      )
      expect(result.error).toBeDefined()
    })
  })
  
  describe("SQL Validation", () => {
    it("should validate that generated SQL contains required elements", () => {
      const validSQL = `
        SELECT service_name, count(*) as cnt 
        FROM traces 
        WHERE service_name IN ('service1', 'service2')
        GROUP BY service_name
      `
      expect(validateGeneratedSQL(validSQL)).toBe(true)
    })
    
    it("should reject SQL with dangerous operations", () => {
      const dangerousSQL = `
        DROP TABLE traces;
        SELECT * FROM traces WHERE service_name = 'test'
      `
      expect(validateGeneratedSQL(dangerousSQL)).toBe(false)
    })
    
    it("should reject SQL missing required elements", () => {
      const incompleteSQL = `
        service_name, count(*) as cnt 
        WHERE service_name IN ('service1')
      `
      expect(validateGeneratedSQL(incompleteSQL)).toBe(false)
    })
  })
})