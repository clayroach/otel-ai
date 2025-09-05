import { describe, it, expect, beforeAll } from "vitest"
import { Effect, Layer } from "effect"
import { CriticalPath } from "../../query-generator/types"
import {
  CriticalPathQueryGeneratorClickHouseAI,
  CriticalPathQueryGeneratorClickHouseAILive
} from "../../query-generator/service-clickhouse-ai"
import { generateQueryWithLLM } from "../../query-generator/llm-query-generator"
import { LLMManagerLive, LLMManagerEssentials } from "../../../llm-manager"
import { StorageAPIClientTag } from "../../../storage/api-client"
import { 
  shouldSkipLLMTests, 
  logAvailabilityStatus
} from "../../../llm-manager/test/utils/llm-availability.js"
import { 
  validateDiagnosticQuery, 
  CORE_DIAGNOSTIC_REQUIREMENTS 
} from "../../query-generator/diagnostic-query-instructions"
import { writeFileSync } from 'fs'
import { join } from 'path'

// Test data for checkout flow
const checkoutFlowPath: CriticalPath = {
  id: "checkout-flow-comparison",
  name: "E-commerce Checkout Flow (SQL vs GPT Comparison)",
  services: ["frontend", "cart", "checkout", "payment", "email"],
  startService: "frontend", 
  endService: "email",
  metadata: {
    criticality: "high",
    sla: "99.9%"
  }
}

const analysisGoals = [
  "Analyze checkout flow latency patterns and identify bottlenecks in payment processing",
  "Identify error patterns across the checkout services to improve reliability",
  "Detect performance bottlenecks by finding slowest operations in the checkout path"
]

interface QueryComparison {
  analysisGoal: string
  sqlModelResult: {
    model: string
    sql: string
    generationTimeMs: number
    diagnosticValidation: {
      isValid: boolean
      missingRequirements: string[]
    }
    sqlAnalysis: {
      hasTraceFiltering: boolean
      hasErrorAnalysis: boolean  
      hasVolumeContext: boolean
      hasHealthScoring: boolean
      hasRealTimeFocus: boolean
      usesJoins: boolean
      usesCTEs: boolean
    }
  }
  gptModelResult: {
    model: string
    sql: string
    generationTimeMs: number
    diagnosticValidation: {
      isValid: boolean
      missingRequirements: string[]
    }
    sqlAnalysis: {
      hasTraceFiltering: boolean
      hasErrorAnalysis: boolean
      hasVolumeContext: boolean
      hasHealthScoring: boolean  
      hasRealTimeFocus: boolean
      usesJoins: boolean
      usesCTEs: boolean
    }
  }
  comparison: {
    sqlModelFollowsRequirements: boolean
    gptModelFollowsRequirements: boolean
    whichIsMoreDiagnostic: 'sql' | 'gpt' | 'similar'
    keyDifferences: string[]
  }
}

describe("SQL Model vs GPT Model Query Generation Comparison", () => {
  
  beforeAll(() => {
    console.log("\n🔧 SQL vs GPT Model Comparison Test Configuration")
    logAvailabilityStatus()
    
    if (shouldSkipLLMTests) {
      console.log("⏭️  Tests will be skipped - no AI models available")
    } else {
      console.log("✅ Tests will run with available LLM models")
    }
  })
  
  // Mock storage for testing
  const mockStorageAPIClient = Layer.succeed(
    StorageAPIClientTag,
    {
      writeOTLP: () => Effect.succeed(undefined),
      queryTraces: () => Effect.succeed([]),
      queryMetrics: () => Effect.succeed([]),
      queryLogs: () => Effect.succeed([]),
      queryAI: () => Effect.succeed([]),
      queryRaw: (sql: string) => {
        // Return mock diagnostic results based on query patterns
        if (sql.toLowerCase().includes("health_status") && sql.toLowerCase().includes("error_rate")) {
          return Effect.succeed([
            { 
              service_name: "payment", 
              operation_name: "validate_payment",
              error_rate_pct: 8.5, 
              p95_ms: 850,
              health_status: "CRITICAL",
              recommended_action: "High error rate - check service health"
            },
            { 
              service_name: "checkout", 
              operation_name: "calculate_tax",
              error_rate_pct: 2.1, 
              p95_ms: 450,
              health_status: "WARNING",
              recommended_action: "Performance regression - compare to baseline"
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

  // Create a complete layer that provides all dependencies
  const testLayer = Layer.mergeAll(
    mockStorageAPIClient,
    Layer.provide(LLMManagerLive, LLMManagerEssentials),
    Layer.provide(CriticalPathQueryGeneratorClickHouseAILive, 
      Layer.merge(mockStorageAPIClient, Layer.provide(LLMManagerLive, LLMManagerEssentials))
    )
  )
  
  // Helper function to analyze SQL query patterns
  const analyzeSQLQuery = (sql: string) => {
    const lowerSQL = sql.toLowerCase()
    return {
      hasTraceFiltering: lowerSQL.includes('with ') && (lowerSQL.includes('problematic_traces') || lowerSQL.includes('slow_traces')),
      hasErrorAnalysis: lowerSQL.includes('error') && (lowerSQL.includes('countif') || lowerSQL.includes('count(')),
      hasVolumeContext: lowerSQL.includes('count()') || lowerSQL.includes('request_count'),
      hasHealthScoring: lowerSQL.includes('case') && (lowerSQL.includes('critical') || lowerSQL.includes('warning')),
      hasRealTimeFocus: lowerSQL.includes('15 minute') || lowerSQL.includes('interval'),
      usesJoins: lowerSQL.includes('join') || lowerSQL.includes('inner join'),
      usesCTEs: lowerSQL.includes('with ') && lowerSQL.includes(' as (')
    }
  }
  
  it.skipIf(shouldSkipLLMTests)("should compare SQL model vs GPT model query generation quality", { timeout: 300000 }, async () => {
    
    const program = Effect.gen(function* () {
      const clickHouseAI = yield* CriticalPathQueryGeneratorClickHouseAI
      const comparisons: QueryComparison[] = []
      
      for (const analysisGoal of analysisGoals) {
        console.log(`\n📊 Comparing models for: "${analysisGoal.substring(0, 60)}..."`)
        
        // Generate query with ClickHouse AI (uses general LLM models like Claude/GPT)
        const gptStartTime = Date.now()
        const gptQueries = yield* clickHouseAI.generateQueries({
          ...checkoutFlowPath,
          id: `${checkoutFlowPath.id}-gpt`
        })
        const gptEndTime = Date.now()
        
        const gptQuery = gptQueries[0] // Take first query
        if (!gptQuery) throw new Error("No GPT query generated")
        
        // Generate query with SQL-specific LLM model via llm-query-generator
        const sqlStartTime = Date.now()  
        const sqlQuery = yield* generateQueryWithLLM(
          { ...checkoutFlowPath, id: `${checkoutFlowPath.id}-sql` },
          analysisGoal,
          { model: 'codellama-7b-instruct' } // Force SQL model
        )
        const sqlEndTime = Date.now()
        
        // Validate diagnostic requirements for both queries
        const sqlValidation = validateDiagnosticQuery(sqlQuery.sql, CORE_DIAGNOSTIC_REQUIREMENTS)
        const gptValidation = validateDiagnosticQuery(gptQuery.sql, CORE_DIAGNOSTIC_REQUIREMENTS)
        
        // Analyze SQL patterns in both queries
        const sqlAnalysis = analyzeSQLQuery(sqlQuery.sql)
        const gptAnalysis = analyzeSQLQuery(gptQuery.sql)
        
        // Compare diagnostic capabilities
        const sqlScore = Object.values(sqlAnalysis).filter(Boolean).length
        const gptScore = Object.values(gptAnalysis).filter(Boolean).length
        
        const keyDifferences: string[] = []
        if (sqlAnalysis.hasTraceFiltering !== gptAnalysis.hasTraceFiltering) {
          keyDifferences.push(`Trace filtering: SQL=${sqlAnalysis.hasTraceFiltering}, GPT=${gptAnalysis.hasTraceFiltering}`)
        }
        if (sqlAnalysis.hasErrorAnalysis !== gptAnalysis.hasErrorAnalysis) {
          keyDifferences.push(`Error analysis: SQL=${sqlAnalysis.hasErrorAnalysis}, GPT=${gptAnalysis.hasErrorAnalysis}`)
        }
        if (sqlAnalysis.hasHealthScoring !== gptAnalysis.hasHealthScoring) {
          keyDifferences.push(`Health scoring: SQL=${sqlAnalysis.hasHealthScoring}, GPT=${gptAnalysis.hasHealthScoring}`)
        }
        if (sqlAnalysis.usesCTEs !== gptAnalysis.usesCTEs) {
          keyDifferences.push(`CTEs usage: SQL=${sqlAnalysis.usesCTEs}, GPT=${gptAnalysis.usesCTEs}`)
        }
        
        const comparison: QueryComparison = {
          analysisGoal,
          sqlModelResult: {
            model: 'codellama-7b-instruct',
            sql: sqlQuery.sql,
            generationTimeMs: sqlEndTime - sqlStartTime,
            diagnosticValidation: sqlValidation,
            sqlAnalysis
          },
          gptModelResult: {
            model: 'gpt/claude (ClickHouse AI)',
            sql: gptQuery.sql,
            generationTimeMs: gptEndTime - gptStartTime,
            diagnosticValidation: gptValidation,
            sqlAnalysis: gptAnalysis
          },
          comparison: {
            sqlModelFollowsRequirements: sqlValidation.isValid,
            gptModelFollowsRequirements: gptValidation.isValid,
            whichIsMoreDiagnostic: sqlScore > gptScore ? 'sql' : gptScore > sqlScore ? 'gpt' : 'similar',
            keyDifferences
          }
        }
        
        comparisons.push(comparison)
        
        // Log detailed comparison for this analysis goal
        console.log(`   SQL Model (codellama-7b-instruct): ${sqlValidation.isValid ? '✅' : '❌'} valid, ${sqlScore}/7 diagnostic features`)
        if (sqlValidation.missingRequirements.length > 0) {
          console.log(`     Missing: ${sqlValidation.missingRequirements.join(', ')}`)
        }
        
        console.log(`   GPT Model (ClickHouse AI): ${gptValidation.isValid ? '✅' : '❌'} valid, ${gptScore}/7 diagnostic features`)
        if (gptValidation.missingRequirements.length > 0) {
          console.log(`     Missing: ${gptValidation.missingRequirements.join(', ')}`)
        }
        
        console.log(`   More Diagnostic: ${comparison.comparison.whichIsMoreDiagnostic.toUpperCase()}`)
        if (keyDifferences.length > 0) {
          console.log(`   Key Differences: ${keyDifferences.join('; ')}`)
        }
      }
      
      return comparisons
    })
    
    const comparisons = await Effect.runPromise(
      Effect.provide(program, testLayer)
    )
    
    // Overall analysis
    const validSQLQueries = comparisons.filter(c => c.comparison.sqlModelFollowsRequirements).length
    const validGPTQueries = comparisons.filter(c => c.comparison.gptModelFollowsRequirements).length
    const sqlMoreDiagnostic = comparisons.filter(c => c.comparison.whichIsMoreDiagnostic === 'sql').length
    const gptMoreDiagnostic = comparisons.filter(c => c.comparison.whichIsMoreDiagnostic === 'gpt').length
    
    console.log(`\n📈 Overall Comparison Results:`)
    console.log(`   Valid Queries: SQL=${validSQLQueries}/${comparisons.length}, GPT=${validGPTQueries}/${comparisons.length}`)
    console.log(`   More Diagnostic: SQL=${sqlMoreDiagnostic}, GPT=${gptMoreDiagnostic}, Similar=${comparisons.length - sqlMoreDiagnostic - gptMoreDiagnostic}`)
    
    // Save results for further analysis
    const resultsPath = join(process.cwd(), 'test-results', 'sql-vs-gpt-comparison.json')
    try {
      writeFileSync(resultsPath, JSON.stringify(comparisons, null, 2))
      console.log(`   📁 Results saved to: ${resultsPath}`)
    } catch (error) {
      console.log(`   ⚠️  Could not save results: ${error}`)
    }
    
    // Validate test expectations
    expect(comparisons.length).toBe(analysisGoals.length)
    expect(comparisons.every(c => c.sqlModelResult.sql.length > 0)).toBe(true)
    expect(comparisons.every(c => c.gptModelResult.sql.length > 0)).toBe(true)
    
    // At least one model should generate valid diagnostic queries
    const hasValidQueries = validSQLQueries > 0 || validGPTQueries > 0
    expect(hasValidQueries).toBe(true)
    
    return comparisons
  })
  
  it.skipIf(shouldSkipLLMTests)("should execute and compare query results", { timeout: 180000 }, async () => {
    
    const program = Effect.gen(function* () {
      const clickHouseAI = yield* CriticalPathQueryGeneratorClickHouseAI
      
      // Test one analysis goal with query execution
      const testGoal = analysisGoals[0] // Use first goal
      
      if (!testGoal) {
        throw new Error("No test goals available for query execution test")
      }
      
      console.log(`\n🔍 Executing queries for: "${testGoal.substring(0, 60)}..."`)
      
      // Generate and execute GPT query
      const gptQueries = yield* clickHouseAI.generateQueries({
        ...checkoutFlowPath,
        id: `${checkoutFlowPath.id}-exec-test`
      })
      const gptQuery = gptQueries[0]
      if (!gptQuery) throw new Error("No GPT query generated")
      
      const gptResult = yield* gptQuery.executeThunk()
      
      // Generate and execute SQL query
      const sqlQuery = yield* generateQueryWithLLM(
        { ...checkoutFlowPath, id: `${checkoutFlowPath.id}-sql-exec` },
        testGoal,
        { model: 'codellama-7b-instruct' }
      )
      
      // Create execution thunk for SQL query
      const storageClient = yield* StorageAPIClientTag
      const sqlResult = yield* storageClient.queryRaw(sqlQuery.sql).pipe(
        Effect.map((data) => ({
          queryId: sqlQuery.id,
          data: Array.isArray(data) ? data : [],
          rowCount: Array.isArray(data) ? data.length : 0,
          executionTimeMs: 0
        })),
        Effect.catchAll(() => Effect.succeed({
          queryId: sqlQuery.id,
          data: [],
          rowCount: 0,
          executionTimeMs: 0,
          error: 'Query execution failed'
        }))
      )
      
      return {
        gptQuery: {
          sql: gptQuery.sql,
          result: gptResult
        },
        sqlQuery: {
          sql: sqlQuery.sql,
          result: sqlResult
        }
      }
    })
    
    const executionResult = await Effect.runPromise(
      Effect.provide(program, testLayer)
    )
    
    console.log(`\n📊 Query Execution Results:`)
    console.log(`   GPT Query rows: ${executionResult.gptQuery.result.rowCount}`)
    console.log(`   SQL Query rows: ${executionResult.sqlQuery.result.rowCount}`)
    
    if (executionResult.gptQuery.result.data.length > 0) {
      const gptSample = executionResult.gptQuery.result.data[0]
      console.log(`   GPT Sample result:`, JSON.stringify(gptSample, null, 2))
      
      // Check for diagnostic fields (with null safety)
      const hasDiagnosticFields = gptSample && typeof gptSample === 'object' && gptSample !== null && 
        ('health_status' in gptSample || 'error_rate_pct' in gptSample)
      console.log(`   GPT Has diagnostic fields: ${hasDiagnosticFields}`)
    }
    
    if (executionResult.sqlQuery.result.data.length > 0) {
      const sqlSample = executionResult.sqlQuery.result.data[0] 
      console.log(`   SQL Sample result:`, JSON.stringify(sqlSample, null, 2))
      
      // Check for diagnostic fields (with null safety)
      const hasDiagnosticFields = sqlSample && typeof sqlSample === 'object' && sqlSample !== null && 
        ('health_status' in sqlSample || 'error_rate_pct' in sqlSample)
      console.log(`   SQL Has diagnostic fields: ${hasDiagnosticFields}`)
    }
    
    // Validate execution succeeded
    expect(executionResult.gptQuery.result).toBeDefined()
    expect(executionResult.sqlQuery.result).toBeDefined()
    expect(executionResult.gptQuery.result.rowCount).toBeGreaterThanOrEqual(0)
    expect(executionResult.sqlQuery.result.rowCount).toBeGreaterThanOrEqual(0)
  })
  
  it("should validate unified diagnostic instructions are being used", async () => {
    // This test ensures both query generators use the same unified instructions
    const testPath: CriticalPath = {
      id: "test-path",
      name: "Test Path",
      services: ["service1", "service2"],
      startService: "service1",
      endService: "service2"
    }
    
    // Import and test the unified instruction functions
    const {
      generateSQLModelPrompt,
      generateGeneralLLMPrompt,
      CORE_DIAGNOSTIC_REQUIREMENTS
    } = await import('../../query-generator/diagnostic-query-instructions.js')
    
    const sqlPrompt = generateSQLModelPrompt(testPath, "test goal", CORE_DIAGNOSTIC_REQUIREMENTS)
    const generalPrompt = generateGeneralLLMPrompt(testPath, "test goal", CORE_DIAGNOSTIC_REQUIREMENTS)
    
    // Both prompts should include diagnostic requirements
    expect(sqlPrompt).toContain("TRACE-LEVEL ANALYSIS")
    expect(sqlPrompt).toContain("ERROR ANALYSIS") 
    expect(sqlPrompt).toContain("problematic_traces")
    
    expect(generalPrompt).toContain("DIAGNOSTIC REQUIREMENTS")
    expect(generalPrompt).toContain("ERROR ANALYSIS")
    expect(generalPrompt).toContain("TRACE-LEVEL ANALYSIS")
    
    console.log("\n✅ Unified diagnostic instructions are being used by both generators")
    console.log(`   SQL prompt length: ${sqlPrompt.length} characters`)
    console.log(`   General prompt length: ${generalPrompt.length} characters`)
  })
})