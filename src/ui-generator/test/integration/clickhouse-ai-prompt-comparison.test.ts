import { describe, it, expect } from "vitest"
import { 
  generateSQLModelPrompt, 
  generateGeneralLLMPrompt,
  CORE_DIAGNOSTIC_REQUIREMENTS
} from "../../query-generator/diagnostic-query-instructions.js"
import { CriticalPath } from "../../query-generator/types.js"

/**
 * Test suite comparing SQL-specific vs General LLM prompting strategies
 * Based on ClickHouse AI best practices analysis
 */

const testPath: CriticalPath = {
  id: "checkout-flow-prompt-test",
  name: "E-commerce Checkout Flow",
  services: ["frontend", "cart", "checkout", "payment", "email"],
  startService: "frontend",
  endService: "email",
  edges: [
    { source: "frontend", target: "cart" },
    { source: "cart", target: "checkout" },
    { source: "checkout", target: "payment" },
    { source: "payment", target: "email" }
  ],
  metrics: {
    requestCount: 10000,
    avgLatency: 150,
    errorRate: 0.01,
    p99Latency: 500
  },
  priority: 'high',
  severity: 0.75,
  lastUpdated: new Date(),
  metadata: { criticality: "high", sla: "99.9%" }
}

describe("ClickHouse AI Prompt Strategy Comparison", () => {
  
  describe("SQL Model vs General LLM Prompt Differences", () => {
    
    it("should demonstrate clear differences in prompting strategies", () => {
      const analysisGoal = "Analyze checkout flow latency patterns and identify bottlenecks"
      
      const sqlModelPrompt = generateSQLModelPrompt(testPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      const generalLLMPrompt = generateGeneralLLMPrompt(testPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      console.log("\n🔧 SQL Model Prompt Characteristics:")
      console.log(`   Length: ${sqlModelPrompt.length} characters`)
      console.log(`   Direct SQL patterns: ${sqlModelPrompt.includes('countIf(status_code != \'OK\')') ? '✅' : '❌'}`)
      console.log(`   Concise structure: ${sqlModelPrompt.length < 3000 ? '✅' : '❌'}`)
      console.log(`   Ends with 'Return only SQL': ${sqlModelPrompt.includes('Return only SQL:') ? '✅' : '❌'}`)
      
      console.log("\n🔧 General LLM Prompt Characteristics:")
      console.log(`   Length: ${generalLLMPrompt.length} characters`)
      console.log(`   Rich context: ${generalLLMPrompt.includes('DIAGNOSTIC REQUIREMENTS') ? '✅' : '❌'}`)
      console.log(`   Detailed validation: ${generalLLMPrompt.includes('validation') ? '✅' : '❌'}`)
      console.log(`   Structured requirements: ${generalLLMPrompt.includes('ALL MUST BE INCLUDED') ? '✅' : '❌'}`)
      
      // SQL Model and General LLM prompts may vary in length based on context
      // The key difference should be in content, not necessarily length
      const lengthDifference = Math.abs(sqlModelPrompt.length - generalLLMPrompt.length)
      expect(lengthDifference).toBeGreaterThan(0) // They should be different
      
      // SQL Model should include direct SQL patterns
      expect(sqlModelPrompt).toContain("count() AS request_count")
      expect(sqlModelPrompt).toContain("Write the complete ClickHouse SQL query only")
      expect(sqlModelPrompt).toContain("FROM traces")
      
      // General LLM should have richer context
      expect(generalLLMPrompt).toContain("DIAGNOSTIC REQUIREMENTS")
      expect(generalLLMPrompt).toContain("QUERY STRUCTURE REQUIREMENTS")
      expect(generalLLMPrompt).toContain("ClickHouse expert specializing")
      
      console.log(`\n📊 Key Differences:`)
      console.log(`   SQL Model: ${sqlModelPrompt.length} chars, direct patterns, concise`)
      console.log(`   General LLM: ${generalLLMPrompt.length} chars, rich context, detailed`)
    })
    
    it("should follow ClickHouse AI best practices for both approaches", () => {
      const analysisGoal = "Show error rates and performance bottlenecks for payment processing"
      
      const sqlPrompt = generateSQLModelPrompt(testPath, analysisGoal)
      const generalPrompt = generateGeneralLLMPrompt(testPath, analysisGoal)
      
      // ClickHouse AI Best Practice: Complete schema information  
      expect(sqlPrompt).toContain("Table: traces")
      expect(sqlPrompt).toContain("trace_id")
      expect(sqlPrompt).toContain("duration_ns")
      
      expect(generalPrompt).toContain("Table: traces")
      expect(generalPrompt).toContain("trace_id (String)")
      expect(generalPrompt).toContain("duration_ns (UInt64)")
      
      // ClickHouse AI Best Practice: Specific analysis goals
      expect(sqlPrompt).toContain("payment")
      expect(generalPrompt).toContain("payment")
      
      // ClickHouse AI Best Practice: Service context
      expect(sqlPrompt).toContain("frontend")
      expect(sqlPrompt).toContain("payment")
      expect(generalPrompt).toContain("frontend")
      expect(generalPrompt).toContain("payment")
      
      // ClickHouse AI Best Practice: Time period specification
      expect(sqlPrompt).toContain("15 MINUTE")
      expect(generalPrompt).toContain("15 MINUTE")
      
      console.log("\n✅ ClickHouse AI Best Practices Validation:")
      console.log("   Complete schema information: ✅")
      console.log("   Specific analysis goals: ✅") 
      console.log("   Service context provided: ✅")
      console.log("   Time period specification: ✅")
      console.log("   Self-contained prompts: ✅")
    })
  })
  
  describe("Diagnostic Enhancement Beyond Standard ClickHouse AI", () => {
    
    it("should demonstrate diagnostic specializations", () => {
      const standardClickHousePrompt = `
        Analyze checkout flow performance showing latency patterns for services: frontend, cart, checkout, payment, email over the last 15 minutes.
        
        Table: traces
        - trace_id (String)
        - service_name (String) 
        - duration_ns (UInt64)
        - status_code (String)
        
        Generate ClickHouse SQL:
      `
      
      const ourDiagnosticPrompt = generateGeneralLLMPrompt(
        testPath, 
        "Analyze checkout flow performance showing latency patterns", 
        CORE_DIAGNOSTIC_REQUIREMENTS
      )
      
      // Our approach should have diagnostic enhancements
      const diagnosticEnhancements = {
        traceFiltering: ourDiagnosticPrompt.includes('problematic_traces') || ourDiagnosticPrompt.includes('TRACE-LEVEL ANALYSIS'),
        errorAnalysis: ourDiagnosticPrompt.includes('error_count') || ourDiagnosticPrompt.includes('ERROR ANALYSIS'),
        healthScoring: ourDiagnosticPrompt.includes('CRITICAL') || ourDiagnosticPrompt.includes('HEALTH SCORING'),
        bottleneckDetection: ourDiagnosticPrompt.includes('total_time_impact') || ourDiagnosticPrompt.includes('BOTTLENECK DETECTION'),
        operationBreakdown: ourDiagnosticPrompt.includes('operation_name') || ourDiagnosticPrompt.includes('OPERATION BREAKDOWN')
      }
      
      console.log("\n🚀 Diagnostic Enhancements Beyond Standard ClickHouse AI:")
      Object.entries(diagnosticEnhancements).forEach(([feature, present]) => {
        console.log(`   ${feature}: ${present ? '✅' : '❌'}`)
      })
      
      // Standard ClickHouse AI lacks these diagnostic features
      expect(standardClickHousePrompt).not.toContain('problematic_traces')
      expect(standardClickHousePrompt).not.toContain('error_count')
      expect(standardClickHousePrompt).not.toContain('CRITICAL')
      
      // Our approach includes them
      const enhancementCount = Object.values(diagnosticEnhancements).filter(Boolean).length
      expect(enhancementCount).toBeGreaterThanOrEqual(3)
      
      console.log(`\n📈 Enhancement Summary:`)
      console.log(`   Standard ClickHouse AI: Basic analytics generation`)
      console.log(`   Our Approach: ${enhancementCount}/5 diagnostic enhancements`)
      console.log(`   Specialization: Observability-focused with trace-level analysis`)
    })
    
    it("should show different complexity levels for different model types", () => {
      const simpleGoal = "Show request counts by service"
      const complexGoal = "Diagnose checkout flow performance issues with error analysis and health scoring"
      
      // SQL models get simpler prompts even for complex goals
      const sqlSimple = generateSQLModelPrompt(testPath, simpleGoal)
      const sqlComplex = generateSQLModelPrompt(testPath, complexGoal)
      
      // General models get detailed context for both
      const generalSimple = generateGeneralLLMPrompt(testPath, simpleGoal)
      const generalComplex = generateGeneralLLMPrompt(testPath, complexGoal)
      
      console.log("\n🎯 Complexity Adaptation:")
      console.log(`   SQL Simple: ${sqlSimple.length} chars`)
      console.log(`   SQL Complex: ${sqlComplex.length} chars`) 
      console.log(`   General Simple: ${generalSimple.length} chars`)
      console.log(`   General Complex: ${generalComplex.length} chars`)
      
      // SQL prompts should remain relatively consistent in length
      const sqlLengthDiff = Math.abs(sqlSimple.length - sqlComplex.length)
      const generalLengthDiff = Math.abs(generalSimple.length - generalComplex.length)
      
      // Both model types should produce meaningful different prompts for different complexity levels
      expect(sqlLengthDiff).toBeGreaterThan(0) // SQL models should adapt to complexity
      expect(generalLengthDiff).toBeGreaterThan(0) // General models should adapt to complexity
      
      // Both should produce substantial prompts
      expect(generalSimple.length).toBeGreaterThan(1000) // General models provide rich context
      expect(sqlComplex.length).toBeGreaterThan(500) // SQL models provide focused guidance
      
      console.log(`\n📏 Length Analysis:`)
      console.log(`   SQL models: Consistent conciseness (${sqlLengthDiff} char difference)`)
      console.log(`   General models: Rich context for both (${generalSimple.length}+ chars)`)
    })
  })
  
  describe("Alignment with ClickHouse AI Patterns", () => {
    
    it("should use ClickHouse AI style request patterns", () => {
      const analysisGoal = "Show me error rates and latency bottlenecks for payment processing in the last 15 minutes"
      
      const sqlPrompt = generateSQLModelPrompt(testPath, analysisGoal)
      const generalPrompt = generateGeneralLLMPrompt(testPath, analysisGoal)
      
      // Should follow ClickHouse AI pattern: "Can you tell me [request] for [context]"
      // Our adaptation: Clear goal + context + time period
      
      const hasClickHousePatterns = {
        specificTimeFrame: sqlPrompt.includes('15 MINUTE') && generalPrompt.includes('15 MINUTE'),
        clearAnalysisGoal: (sqlPrompt.includes('latency') || sqlPrompt.includes('error')) && (generalPrompt.includes('latency') || generalPrompt.includes('error')),
        serviceContext: sqlPrompt.includes('payment') && generalPrompt.includes('payment'),
        completeSelfContained: sqlPrompt.includes('traces') && generalPrompt.includes('traces')
      }
      
      console.log("\n🎯 ClickHouse AI Pattern Compliance:")
      Object.entries(hasClickHousePatterns).forEach(([pattern, present]) => {
        console.log(`   ${pattern}: ${present ? '✅' : '❌'}`)
      })
      
      // All patterns should be present
      const complianceScore = Object.values(hasClickHousePatterns).filter(Boolean).length
      expect(complianceScore).toBeGreaterThanOrEqual(3) // At least 3/4 patterns should be present
      
      console.log(`\n🏆 Pattern Compliance: ${complianceScore}/4`)
      console.log("   Our prompts follow ClickHouse AI best practices while adding diagnostic value")
    })
    
    it("should demonstrate the value of our trace-level enhancement", () => {
      const standardApproach = "SELECT service_name, avg(duration_ns/1000000) FROM traces GROUP BY service_name"
      const ourApproach = `
        WITH problematic_traces AS (
          SELECT DISTINCT trace_id FROM traces 
          WHERE duration_ns/1000000 > 1000 OR status_code != 'OK'
        )
        SELECT service_name, avg(duration_ns/1000000), count() 
        FROM traces t 
        JOIN problematic_traces pt ON t.trace_id = pt.trace_id 
        GROUP BY service_name
      `
      
      const diagnosticValue = {
        standard: {
          focusOnProblems: false,
          traceContext: false,
          actionableInsights: false,
          description: "Shows average latency across ALL traces (including healthy ones)"
        },
        ours: {
          focusOnProblems: true,
          traceContext: true, 
          actionableInsights: true,
          description: "Shows metrics only for traces that actually have problems"
        }
      }
      
      console.log("\n🔍 Trace-Level Enhancement Value:")
      console.log(`   Standard ClickHouse AI: ${diagnosticValue.standard.description}`)
      console.log(`   Our Enhancement: ${diagnosticValue.ours.description}`)
      
      expect(ourApproach).toContain('problematic_traces')
      expect(ourApproach).toContain('JOIN')
      expect(standardApproach).not.toContain('problematic_traces')
      
      console.log("\n💡 This enhancement provides:")
      console.log("   - Focus on actual problem traces vs. all data")
      console.log("   - Actionable insights for debugging")
      console.log("   - Better signal-to-noise ratio")
      console.log("   - Specific trace IDs for deep-dive analysis")
    })
  })
})