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

// Mock trace data that would be returned from ClickHouse
const mockTraceData = [
  {
    trace_id: "abc123",
    span_id: "span1",
    service_name: "frontend",
    operation_name: "/checkout",
    start_time: new Date("2024-01-15T10:00:00Z"),
    duration_ns: 150000000, // 150ms
    status_code: "OK"
  },
  {
    trace_id: "abc123",
    span_id: "span2",
    service_name: "cart-service",
    operation_name: "validateCart",
    start_time: new Date("2024-01-15T10:00:00.150Z"),
    duration_ns: 50000000, // 50ms
    status_code: "OK"
  },
  {
    trace_id: "abc123",
    span_id: "span3",
    service_name: "payment-service",
    operation_name: "processPayment",
    start_time: new Date("2024-01-15T10:00:00.200Z"),
    duration_ns: 300000000, // 300ms
    status_code: "OK"
  },
  {
    trace_id: "abc124",
    span_id: "span4",
    service_name: "payment-service",
    operation_name: "processPayment",
    start_time: new Date("2024-01-15T10:00:01Z"),
    duration_ns: 500000000, // 500ms - slower request
    status_code: "ERROR",
    status_message: "Payment gateway timeout"
  },
  {
    trace_id: "abc125",
    span_id: "span5",
    service_name: "inventory-service",
    operation_name: "reserveItems",
    start_time: new Date("2024-01-15T10:00:02Z"),
    duration_ns: 75000000, // 75ms
    status_code: "OK"
  }
]

// Expected patterns in generated queries
const expectedQueryPatterns = {
  latency: {
    requiredClauses: [
      "quantile(0.5)",
      "quantile(0.95)",
      "quantile(0.99)",
      "duration_ns/1000000", // Converting to milliseconds
      "GROUP BY service_name"
    ],
    description: "Should calculate percentile latencies"
  },
  errors: {
    requiredClauses: [
      "status_code != 'OK'",
      "count()",
      "GROUP BY service_name",
      "status_message"
    ],
    description: "Should filter and group errors"
  },
  bottlenecks: {
    requiredClauses: [
      "operation_name",
      "quantile(0.95)",
      "duration_ns/1000000",
      "ORDER BY"
    ],
    description: "Should identify slow operations"
  },
  throughput: {
    requiredClauses: [
      "count()",
      "toStartOfMinute",
      "GROUP BY service_name"
    ],
    description: "Should calculate request rates"
  }
}

describe("LLM Query Generator", () => {
  describe("Query Generation with Mock LLM", () => {
    // Mock LLM that returns predictable queries (defined but not used directly in these tests)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const _mockLLMManager = {
      generate: (request: { prompt: string }) => {
        // Parse the analysis goal from the prompt
        const isLatency = request.prompt.includes("latency patterns")
        const isError = request.prompt.includes("error patterns")
        const isBottleneck = request.prompt.includes("bottlenecks")
        const isThroughput = request.prompt.includes("throughput")
        
        let sql = ""
        let description = ""
        
        if (isLatency) {
          sql = `
            SELECT 
              service_name,
              toStartOfMinute(start_time) as minute,
              quantile(0.5)(duration_ns/1000000) as p50_ms,
              quantile(0.95)(duration_ns/1000000) as p95_ms,
              quantile(0.99)(duration_ns/1000000) as p99_ms,
              count() as request_count
            FROM traces
            WHERE service_name IN ('frontend', 'cart-service', 'payment-service', 'inventory-service', 'notification-service')
              AND start_time >= now() - INTERVAL 60 MINUTE
            GROUP BY service_name, minute
            ORDER BY minute DESC, service_name
          `
          description = "Analyzes latency percentiles for services in the checkout flow"
        } else if (isError) {
          sql = `
            SELECT 
              service_name,
              status_code,
              status_message,
              count() as error_count
            FROM traces
            WHERE service_name IN ('frontend', 'cart-service', 'payment-service', 'inventory-service', 'notification-service')
              AND status_code != 'OK'
              AND start_time >= now() - INTERVAL 60 MINUTE
            GROUP BY service_name, status_code, status_message
            ORDER BY error_count DESC
          `
          description = "Identifies error patterns across checkout services"
        } else if (isBottleneck) {
          sql = `
            SELECT 
              service_name,
              operation_name,
              quantile(0.95)(duration_ns/1000000) as p95_ms,
              max(duration_ns/1000000) as max_ms,
              count() as operation_count
            FROM traces
            WHERE service_name IN ('frontend', 'cart-service', 'payment-service', 'inventory-service', 'notification-service')
              AND start_time >= now() - INTERVAL 60 MINUTE
            GROUP BY service_name, operation_name
            HAVING p95_ms > 100
            ORDER BY p95_ms DESC
          `
          description = "Detects bottleneck operations in the checkout flow"
        } else if (isThroughput) {
          sql = `
            SELECT 
              service_name,
              toStartOfMinute(start_time) as minute,
              count() as requests_per_minute,
              count() / 60.0 as requests_per_second
            FROM traces
            WHERE service_name IN ('frontend', 'cart-service', 'payment-service', 'inventory-service', 'notification-service')
              AND start_time >= now() - INTERVAL 60 MINUTE
            GROUP BY service_name, minute
            ORDER BY minute DESC
          `
          description = "Measures throughput across checkout services"
        }
        
        const response = {
          sql,
          description,
          expectedColumns: [
            { name: "service_name", type: "String", description: "Service name" },
            { name: "minute", type: "DateTime", description: "Time bucket" }
          ],
          reasoning: "Query optimized for the specific analysis goal",
          insights: "This query will reveal patterns in the data"
        }
        
        return Effect.succeed({
          content: JSON.stringify(response),
          model: "mock-llm",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          metadata: { latencyMs: 10, retryCount: 0, cached: false }
        })
      }
    }
    
    it("should generate valid SQL for latency analysis", async () => {
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, { endpoint: "mock" })
      )
      
      expect(query.sql).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Check for expected patterns
      const sql = query.sql.toUpperCase()
      for (const pattern of expectedQueryPatterns.latency.requiredClauses) {
        expect(sql).toContain(pattern.toUpperCase())
      }
    })
    
    it("should generate valid SQL for error analysis", async () => {
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors, { endpoint: "mock" })
      )
      
      expect(query.sql).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Check for expected patterns
      const sql = query.sql.toUpperCase()
      for (const pattern of expectedQueryPatterns.errors.requiredClauses) {
        expect(sql).toContain(pattern.toUpperCase())
      }
    })
    
    it("should properly escape service names to prevent SQL injection", async () => {
      const maliciousPath: CriticalPath = {
        ...testPath,
        services: ["frontend'; DROP TABLE traces; --", "backend"]
      }
      
      const query = await Effect.runPromise(
        generateQueryWithLLM(maliciousPath, ANALYSIS_GOALS.latency, { endpoint: "mock" })
      )
      
      // The service name should be escaped
      expect(query.sql).toContain("frontend''")
      expect(query.sql).not.toContain("DROP TABLE")
    })
  })
  
  describe("Integration with Storage Layer", () => {
    // Mock storage that returns our test data
    const mockStorageAPIClient = Layer.succeed(
      StorageAPIClientTag,
      {
        writeOTLP: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: (sql: string) => {
          // Simulate different results based on query patterns
          if (sql.includes("status_code != 'OK'")) {
            // Error query - return only error traces
            return Effect.succeed(mockTraceData.filter(t => t.status_code === "ERROR"))
          } else if (sql.includes("quantile")) {
            // Latency query - return aggregated data
            return Effect.succeed([
              { service_name: "payment-service", p50_ms: 250, p95_ms: 450, p99_ms: 490 },
              { service_name: "frontend", p50_ms: 140, p95_ms: 180, p99_ms: 195 }
            ])
          } else if (sql.includes("operation_name")) {
            // Bottleneck query - return slow operations
            return Effect.succeed([
              { service_name: "payment-service", operation_name: "processPayment", p95_ms: 450, operation_count: 100 },
              { service_name: "frontend", operation_name: "/checkout", p95_ms: 180, operation_count: 200 }
            ])
          } else {
            // Default - return all traces
            return Effect.succeed(mockTraceData)
          }
        },
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true })
      }
    )
    
    const testLayer = Layer.provide(
      CriticalPathQueryGeneratorLLMLive,
      mockStorageAPIClient
    )
    
    it("should execute generated queries and return results", async () => {
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
        
        return result
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      expect(result).toBeDefined()
    })
    
    it("should handle query execution errors gracefully", async () => {
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
  
  describe("LLM Response Validation", () => {
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
  
  describe("Real LLM Integration (Skip if no LLM available)", () => {
    let llmAvailable = false
    
    beforeAll(async () => {
      // Check if LLM is available
      try {
        const llmManager = createSimpleLLMManager()
        const healthy = await Effect.runPromise(llmManager.isHealthy())
        llmAvailable = healthy
      } catch {
        llmAvailable = false
      }
    })
    
    it.skipIf(!llmAvailable)("should generate valid query with real LLM", async () => {
      const query = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      expect(query.sql).toBeDefined()
      expect(query.description).toBeDefined()
      expect(validateGeneratedSQL(query.sql)).toBe(true)
      
      // Check that it includes the actual service names
      expect(query.sql).toContain("frontend")
      expect(query.sql).toContain("payment-service")
    })
    
    it.skipIf(!llmAvailable)("should generate deterministic queries for same input", async () => {
      // Generate the same query multiple times
      const query1 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const query2 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const query3 = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      // With temperature=0.3 and same prompt, queries should be very similar if not identical
      // We check for structural similarity rather than exact match
      expect(query1.sql).toBeDefined()
      expect(query2.sql).toBeDefined()
      expect(query3.sql).toBeDefined()
      
      // All should be valid
      expect(validateGeneratedSQL(query1.sql)).toBe(true)
      expect(validateGeneratedSQL(query2.sql)).toBe(true)
      expect(validateGeneratedSQL(query3.sql)).toBe(true)
      
      // All should contain the same key elements for latency analysis
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
      
      // The structure should be similar (same number of SELECT, FROM, WHERE, GROUP BY clauses)
      const countClauses = (sql: string) => ({
        select: (sql.match(/SELECT/gi) || []).length,
        from: (sql.match(/FROM/gi) || []).length,
        where: (sql.match(/WHERE/gi) || []).length,
        groupBy: (sql.match(/GROUP BY/gi) || []).length
      })
      
      const structure1 = countClauses(query1.sql)
      const structure2 = countClauses(query2.sql)
      const structure3 = countClauses(query3.sql)
      
      expect(structure1).toEqual(structure2)
      expect(structure2).toEqual(structure3)
    })
    
    it.skipIf(!llmAvailable)("should generate different queries for different goals", async () => {
      const latencyQuery = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency)
      )
      
      const errorQuery = await Effect.runPromise(
        generateQueryWithLLM(testPath, ANALYSIS_GOALS.errors)
      )
      
      // Queries should be different in structure
      expect(latencyQuery.sql).not.toEqual(errorQuery.sql)
      
      // Latency query should have percentile calculations
      expect(latencyQuery.sql).toContain("quantile")
      
      // Error query should filter for non-OK status
      expect(errorQuery.sql).toContain("status_code")
      expect(errorQuery.sql.toUpperCase()).toContain("!= 'OK'")
      
      // But both should be valid
      expect(validateGeneratedSQL(latencyQuery.sql)).toBe(true)
      expect(validateGeneratedSQL(errorQuery.sql)).toBe(true)
    })
  })
})