import { describe, it, expect, beforeAll } from "vitest"
import { Effect, Layer, Duration } from "effect"
import { CriticalPath } from "../../query-generator/types"
import {
  CriticalPathQueryGeneratorLLMTag,
  CriticalPathQueryGeneratorLLMLive
} from "../../query-generator/service-llm"
import { generateQueryWithLLM, ANALYSIS_GOALS, validateGeneratedSQL } from "../../query-generator/llm-query-generator"
import { StorageAPIClientTag } from "../../../storage/api-client"
import { createSimpleLLMManager } from "../../../llm-manager"
import { getModelMetadata } from "../../../llm-manager/model-registry"

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
  let llmConfig: { endpoint: string; model: string } | undefined
  
  beforeAll(async () => {
    // Check if we should skip LLM tests (for CI environments)
    if (process.env.SKIP_LLM_TESTS === 'true') {
      console.log("⏭️  Skipping LLM tests (SKIP_LLM_TESTS=true)")
      llmAvailable = false
      llmDetails = {
        status: "skipped",
        error: "LLM tests disabled in environment"
      }
      return
    }
    
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
        const metadata = getModelMetadata(model.id)
        const info = metadata ? ` [${metadata.type}, ${metadata.provider}]` : ' [unknown]'
        console.log(`     - ${model.id}${info}`)
      })
      
      // Prioritize models for SQL generation based on environment config
      let selectedModel = null
      
      // Get SQL model preferences from environment
      const sqlModelPreferences = [
        process.env.LLM_SQL_MODEL_1,
        process.env.LLM_SQL_MODEL_2,
        process.env.LLM_SQL_MODEL_3
      ].filter(Boolean)
      
      // Try to find a model from the preference list
      for (const preferredModel of sqlModelPreferences) {
        const found = availableModels.find((m: { id: string }) => 
          m.id === preferredModel || 
          m.id.toLowerCase().includes(preferredModel?.toLowerCase() || '')
        )
        if (found) {
          console.log(`     Found preferred SQL model: ${found.id}`)
          selectedModel = found
          break
        }
      }
      
      // Fallback to hardcoded priority if no preferred model found
      if (!selectedModel) {
        selectedModel = availableModels.find((m: { id: string }) => {
          const modelIdLower = m.id.toLowerCase()
          const metadata = getModelMetadata(m.id)
          
          // First priority: sqlcoder models (actually good at SQL)
          if (modelIdLower.includes('sqlcoder')) {
            console.log(`     Found SQLCoder model: ${m.id}`)
            return true
          }
          // Second priority: codellama models  
          if (m.id === 'codellama-7b-instruct') {
            console.log(`     Found CodeLlama model: ${m.id}`)
            return true
          }
          // Third priority: qwen coder models
          if (modelIdLower.includes('qwen') && modelIdLower.includes('coder')) {
            console.log(`     Found Qwen Coder model: ${m.id}`)
            return true
          }
          // Fourth priority: deepseek-coder models
          if (modelIdLower.includes('deepseek-coder')) {
            console.log(`     Found DeepSeek-Coder model: ${m.id}`)
            return true
          }
          // Skip starcoder for now as it's generating incorrect responses
          // Fifth priority: any SQL/code type that isn't starcoder
          return metadata && (metadata.type === 'sql' || metadata.type === 'code') && !modelIdLower.includes('starcoder')
        }) || availableModels[0]
      }
      
      const selectedMetadata = getModelMetadata(selectedModel.id)
      console.log(`   Selected model for testing: ${selectedModel.id} (${selectedMetadata?.displayName || 'Unknown'})`)
      
      // Try to actually generate a simple test query to verify the LLM is working
      const llmManager = createSimpleLLMManager({
        models: {
          llama: {
            endpoint,
            modelPath: selectedModel.id,
            contextLength: 32768, // Increased context for codellama models
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
          Effect.timeout(Duration.seconds(10)),
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
        
        // Set the llmConfig for use in tests
        llmConfig = {
          endpoint,
          model: selectedModel.id
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
  }, 30000) // 30 second timeout for beforeAll
  
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
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, llmConfig)
      )
      
      expect(query.sql).toBeDefined()
      expect(query.description).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Check that it includes the actual service names
      expect(query.sql).toContain("frontend")
      expect(query.sql).toContain("payment-service")
      
      // Should have latency-specific elements appropriate for the analysis goal
      const sqlLower = query.sql.toLowerCase()
      
      // Must have some form of latency/duration aggregation
      const hasLatencyAggregation = 
        sqlLower.includes("quantile") ||
        sqlLower.includes("avg") ||
        sqlLower.includes("percentile") ||
        sqlLower.includes("min") ||
        sqlLower.includes("max")
      expect(hasLatencyAggregation).toBe(true)
      
      // Must reference duration/latency column
      expect(sqlLower).toContain("duration")
      
      // Must filter or group by service
      expect(sqlLower).toContain("service")
      
      // Must have WHERE clause with service filter
      expect(sqlLower).toMatch(/where.*service.*in/)
    })
    
    it("should generate valid SQL for error analysis", async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors, llmConfig)
      )
      
      expect(query.sql).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Should have error-specific elements appropriate for error analysis
      const sqlLower = query.sql.toLowerCase()
      const sqlUpper = query.sql.toUpperCase()
      
      // Must reference status/error columns
      expect(sqlLower).toContain("status")
      
      // Must have some error filtering condition
      const hasErrorFilter = 
        sqlUpper.includes("!= 'OK'") ||
        sqlUpper.includes("!= 200") ||
        sqlUpper.includes("ERROR") ||
        sqlUpper.includes("<> 'OK'") ||
        sqlLower.includes("not like '%ok%'")
      expect(hasErrorFilter).toBe(true)
      
      // Should aggregate or count errors
      const hasAggregation = 
        sqlLower.includes("count") ||
        sqlLower.includes("sum") ||
        sqlLower.includes("group by")
      expect(hasAggregation).toBe(true)
    })
    
    it("should generate deterministic queries for same input", { timeout: 90000 }, async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      console.log("\n🔄 Testing determinism with temperature=0...")
      
      // Generate the same query 3 times in parallel for speed
      const [query1, query2, query3] = await Promise.all([
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, llmConfig)),
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, llmConfig)),
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, llmConfig))
      ])
      
      // All should be valid
      expect(validateGeneratedSQL(query1.sql)).toBe(true)
      expect(validateGeneratedSQL(query2.sql)).toBe(true)
      expect(validateGeneratedSQL(query3.sql)).toBe(true)
      
      // For deterministic test, queries should be very similar or identical
      // Normalize SQL for comparison (remove extra whitespace, lowercase)
      const normalize = (sql: string) => sql.toLowerCase().replace(/\s+/g, ' ').trim()
      
      const norm1 = normalize(query1.sql)
      const norm2 = normalize(query2.sql)
      const norm3 = normalize(query3.sql)
      
      // With temperature=0, queries should be identical or nearly identical
      // Allow for minor variations in formatting but structure should match
      const similarity = (a: string, b: string) => {
        if (a === b) return 1.0 // Identical
        
        // Check if they have the same clauses in roughly the same order
        const extractClauses = (sql: string) => ({
          select: sql.match(/select\s+([^from]+)/i)?.[1]?.trim(),
          from: sql.match(/from\s+([^where|group|order|limit]+)/i)?.[1]?.trim(),
          where: sql.match(/where\s+([^group|order|limit]+)/i)?.[1]?.trim(),
          groupBy: sql.match(/group\s+by\s+([^order|limit]+)/i)?.[1]?.trim(),
          orderBy: sql.match(/order\s+by\s+([^limit]+)/i)?.[1]?.trim()
        })
        
        const clausesA = extractClauses(a)
        const clausesB = extractClauses(b)
        
        // Count matching clauses
        let matches = 0
        let total = 0
        const keys = ['select', 'from', 'where', 'groupBy', 'orderBy'] as const
        for (const key of keys) {
          if (clausesA[key] || clausesB[key]) {
            total++
            if (clausesA[key] === clausesB[key]) matches++
          }
        }
        
        return total > 0 ? matches / total : 0
      }
      
      const sim12 = similarity(norm1, norm2)
      const sim23 = similarity(norm2, norm3)
      const sim13 = similarity(norm1, norm3)
      
      console.log(`   Query similarity: 1-2: ${sim12.toFixed(2)}, 2-3: ${sim23.toFixed(2)}, 1-3: ${sim13.toFixed(2)}`)
      
      // With temperature=0, at least 80% similarity expected
      expect(sim12).toBeGreaterThanOrEqual(0.8)
      expect(sim23).toBeGreaterThanOrEqual(0.8)
      expect(sim13).toBeGreaterThanOrEqual(0.8)
      
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
    
    it("should generate different queries for different analysis goals", { timeout: 90000 }, async () => {
      if (!llmAvailable) {
        console.log("   ⏭️  Skipping: LLM not available")
        return
      }
      
      // Generate different queries in parallel for speed
      const [latencyQuery, errorQuery, bottleneckQuery] = await Promise.all([
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, llmConfig)),
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors, llmConfig)),
        Effect.runPromise(generateQueryWithLLM(testPath, ANALYSIS_GOALS.bottlenecks, llmConfig))
      ])
      
      // All should be valid
      expect(validateGeneratedSQL(latencyQuery.sql)).toBe(true)
      expect(validateGeneratedSQL(errorQuery.sql)).toBe(true)
      expect(validateGeneratedSQL(bottleneckQuery.sql)).toBe(true)
      
      // Each should have different characteristics
      // Latency query should have duration/time analysis
      const hasLatencyFocus = 
        latencyQuery.sql.toLowerCase().includes("quantile") ||
        latencyQuery.sql.toLowerCase().includes("avg") ||
        latencyQuery.sql.toLowerCase().includes("duration")
      expect(hasLatencyFocus).toBe(true)
      
      // Error query should filter for errors
      const hasErrorFocus = 
        errorQuery.sql.toUpperCase().includes("!= 'OK'") ||
        errorQuery.sql.toUpperCase().includes("!= 200") ||
        errorQuery.sql.toLowerCase().includes("error") ||
        errorQuery.sql.toLowerCase().includes("status")
      expect(hasErrorFocus).toBe(true)
      
      // Bottleneck query should look at operations or performance
      const hasBottleneckFocus = 
        bottleneckQuery.sql.toLowerCase().includes("operation") ||
        bottleneckQuery.sql.toLowerCase().includes("max") ||
        bottleneckQuery.sql.toLowerCase().includes("slow")
      expect(hasBottleneckFocus).toBe(true)
      
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
        generateQueryWithLLM(testPath, customGoal, llmConfig)
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
        services: ["frontend' OR '1'='1", "backend"]
      }
      
      const query = await Effect.runPromise(
        generateQueryWithLLM(maliciousPath, ANALYSIS_GOALS.latency, llmConfig)
      )
      
      // The service name should be escaped or quoted properly
      expect(query.sql).not.toContain("OR '1'='1") // Should not appear unescaped
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