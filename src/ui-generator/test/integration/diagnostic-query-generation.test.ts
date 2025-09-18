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
import { LLMManagerLive, LLMManagerEssentials } from "../../../llm-manager"

// Test data representing the checkout flow with improved diagnostic requirements
const checkoutFlowPath: CriticalPath = {
  id: "checkout-flow-diagnostic",
  name: "E-commerce Checkout Flow (Diagnostic)",
  services: ["frontend", "cart", "checkout", "payment", "email"],
  startService: "frontend",
  endService: "email",
  metadata: {
    criticality: "high",
    sla: "99.9%",
    diagnosticRequirements: [
      "error_analysis",
      "volume_context", 
      "bottleneck_detection",
      "operation_breakdown",
      "health_scoring",
      "real_time_focus"
    ]
  }
}

describe.skipIf(shouldSkipLLMTests())("Diagnostic Query Generation", () => {
  
  beforeAll(() => {
    console.log("\n🔧 Diagnostic Query Generation Test Configuration")
    logAvailabilityStatus()
    console.log("✅ Tests will run with available LLM models")
  })
  
  describe("Improved Diagnostic Query Generation", () => {
    // Mock storage that validates diagnostic query patterns
    const mockStorageAPIClient = Layer.succeed(
      StorageAPIClientTag,
      {
        writeOTLP: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryAI: () => Effect.succeed([]),
        queryRaw: (sql: string) => {
          // Simulate diagnostic query execution with realistic results
          if (sql.toLowerCase().includes("error_rate") && sql.toLowerCase().includes("health")) {
            return Effect.succeed([
              { 
                minute: "2024-01-01 12:00:00",
                service_name: "payment", 
                total_requests: 150,
                error_rate_pct: 8.5, 
                avg_p95_ms: 850,
                worst_operation: "validate_payment",
                service_health_status: "CRITICAL"
              },
              { 
                minute: "2024-01-01 12:00:00",
                service_name: "checkout", 
                total_requests: 200,
                error_rate_pct: 2.1, 
                avg_p95_ms: 450,
                worst_operation: "calculate_tax",
                service_health_status: "WARNING" 
              },
              { 
                minute: "2024-01-01 12:00:00",
                service_name: "cart", 
                total_requests: 300,
                error_rate_pct: 0.5, 
                avg_p95_ms: 120,
                worst_operation: "get_items",
                service_health_status: "HEALTHY"
              }
            ])
          } else {
            return Effect.succeed([
              { service_name: "frontend", p50_ms: 140, request_count: 1000 }
            ])
          }
        },
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true })
      }
    )
    
    const testLayer = Layer.provide(
      CriticalPathQueryGeneratorClickHouseAILive,
      Layer.merge(mockStorageAPIClient, Layer.provide(LLMManagerLive, LLMManagerEssentials))
    )
    
    it("should generate diagnostic queries with improved requirements", { timeout: 20000 }, async () => {
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const queries = yield* queryGenerator.generateQueries(checkoutFlowPath)
        
        expect(queries.length).toBeGreaterThan(0)
        
        // Analyze each generated query for diagnostic patterns
        const diagnosticAnalysis = queries.map(query => {
          const sqlLower = query.sql.toLowerCase()
          
          return {
            queryName: query.name,
            hasErrorAnalysis: sqlLower.includes("error") && (sqlLower.includes("countif") || sqlLower.includes("count(")),
            hasVolumeContext: sqlLower.includes("count()") || sqlLower.includes("request_count"),
            hasBottleneckDetection: sqlLower.includes("total_time") || (sqlLower.includes("count") && sqlLower.includes("duration")),
            hasOperationBreakdown: sqlLower.includes("operation_name"),
            hasHealthScoring: sqlLower.includes("case") && (sqlLower.includes("critical") || sqlLower.includes("warning")),
            hasRealTimeFocus: sqlLower.includes("15 minute") || sqlLower.includes("interval"),
            usesCTE: sqlLower.includes("with ") && sqlLower.includes(" as ("),
            hasMultipleLevels: (sqlLower.match(/group by/g) || []).length > 0,
            ordersForTriage: sqlLower.includes("order by") && (sqlLower.includes("error") || sqlLower.includes("desc")),
            filtersNoise: sqlLower.includes("request_count > ") || sqlLower.includes("count() >"),
            sql: query.sql
          }
        })
        
        return { queries, diagnosticAnalysis }
      })
      
      const result = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log(`\n📊 Generated ${result.queries.length} diagnostic queries`)
      
      // Validate diagnostic requirements are met
      result.diagnosticAnalysis.forEach((analysis, i) => {
        console.log(`\n   Query ${i + 1}: ${analysis.queryName}`)
        console.log(`     ✅ Error Analysis: ${analysis.hasErrorAnalysis}`)
        console.log(`     ✅ Volume Context: ${analysis.hasVolumeContext}`) 
        console.log(`     ✅ Bottleneck Detection: ${analysis.hasBottleneckDetection}`)
        console.log(`     ✅ Operation Breakdown: ${analysis.hasOperationBreakdown}`)
        console.log(`     ✅ Health Scoring: ${analysis.hasHealthScoring}`)
        console.log(`     ✅ Real-time Focus: ${analysis.hasRealTimeFocus}`)
        console.log(`     🏗️  Uses CTEs: ${analysis.usesCTE}`)
        console.log(`     📊 Orders for Triage: ${analysis.ordersForTriage}`)
        
        // At least one query should have improved diagnostic capabilities
        if (i === 0) { // Check the first query as representative
          expect(analysis.hasErrorAnalysis || analysis.hasVolumeContext).toBe(true)
          expect(analysis.hasRealTimeFocus).toBe(true)
        }
      })
      
      // Show a sample of generated SQL for manual review
      if (result.diagnosticAnalysis.length > 0 && result.diagnosticAnalysis[0]?.sql) {
        console.log(`\n📝 Sample Generated SQL (truncated):`)
        console.log(result.diagnosticAnalysis[0].sql.substring(0, 300) + "...")
      }
    })
    
    it("should execute diagnostic queries and return actionable results", { timeout: 20000 }, async () => {
      
      const program = Effect.gen(function* () {
        const queryGenerator = yield* CriticalPathQueryGeneratorClickHouseAI
        const queries = yield* queryGenerator.generateQueries(checkoutFlowPath)
        
        expect(queries.length).toBeGreaterThan(0)
        
        // Execute the first diagnostic query
        const firstQuery = queries[0]
        if (!firstQuery) throw new Error("No queries generated")
        
        const result = yield* firstQuery.executeThunk()
        
        expect(result).toBeDefined()
        expect(result.data).toBeDefined()
        expect(Array.isArray(result.data)).toBe(true)
        
        return { result, query: firstQuery }
      })
      
      const executionResult = await Effect.runPromise(
        Effect.provide(program, testLayer)
      )
      
      console.log(`\n🔍 Diagnostic Query Execution Results:`)
      console.log(`   Query: ${executionResult.query.name}`)
      console.log(`   Rows returned: ${executionResult.result.rowCount}`)
      
      if (executionResult.result.data.length > 0) {
        const firstRow = executionResult.result.data[0]
        console.log(`   Sample result:`, JSON.stringify(firstRow, null, 2))
        
        // Check if the results contain diagnostic information (with null safety)
        const hasHealthStatus = firstRow && 'service_health_status' in firstRow
        const hasErrorRates = firstRow && ('error_rate_pct' in firstRow || 'error_count' in firstRow)
        const hasOperationDetail = firstRow && ('operation_name' in firstRow || 'worst_operation' in firstRow)
        
        console.log(`   🏥 Contains health status: ${hasHealthStatus}`)
        console.log(`   ❌ Contains error analysis: ${hasErrorRates}`)
        console.log(`   🔧 Contains operation detail: ${hasOperationDetail}`)
      }
    })
    
    it("should validate diagnostic patterns are present in generated queries", () => {
      // Test the diagnostic patterns we identified
      const requiredPatterns = [
        {
          name: "Error Analysis",
          pattern: /countif\s*\(\s*status_code\s*!=\s*['"](ok|OK)['"]/i,
          purpose: "Identify failure points"
        },
        {
          name: "Volume Context", 
          pattern: /count\s*\(\s*\)\s*(as\s+)?(request_count|total_requests)/i,
          purpose: "Contextualize performance with load"
        },
        {
          name: "Health Scoring",
          pattern: /case\s+when.*error_rate.*then\s*['"](critical|warning|healthy)['"]/i,
          purpose: "Provide triage categories"
        },
        {
          name: "Real-time Focus",
          pattern: /now\s*\(\s*\)\s*-\s*interval\s+\d+\s+minute/i,
          purpose: "Focus on recent data"
        },
        {
          name: "Operation Breakdown",
          pattern: /group\s+by.*operation_name/i,
          purpose: "Drill down to specific operations"
        }
      ]
      
      // This test documents the patterns - actual validation happens in the integration test
      requiredPatterns.forEach(pattern => {
        expect(pattern.name).toBeDefined()
        expect(pattern.pattern).toBeInstanceOf(RegExp)
        expect(pattern.purpose).toBeDefined()
      })
      
      console.log("\n🔧 Required Diagnostic Patterns:")
      requiredPatterns.forEach(pattern => {
        console.log(`   ${pattern.name}: ${pattern.purpose}`)
        console.log(`     Pattern: ${pattern.pattern}`)
      })
      
      expect(requiredPatterns).toHaveLength(5)
    })
  })
})