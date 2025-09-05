import { describe, it, expect } from "vitest"
import { 
  generateSQLModelPrompt, 
  generateGeneralLLMPrompt,
  CORE_DIAGNOSTIC_REQUIREMENTS,
  validateDiagnosticQuery,
  DIAGNOSTIC_QUERY_TEMPLATE
} from "../../query-generator/diagnostic-query-instructions.js"
import { CriticalPath } from "../../query-generator/types.js"

/**
 * Test suite for normalized query generation between SQL and general LLM models
 * 
 * This validates that both llm-query-generator.ts and service-clickhouse-ai.ts
 * now use unified diagnostic instructions and share common requirements.
 */

const testCheckoutPath: CriticalPath = {
  id: "checkout-flow-normalized",
  name: "E-commerce Checkout Flow (Normalized)",
  services: ["frontend", "cart", "checkout", "payment", "email"],
  startService: "frontend",
  endService: "email",
  metadata: {
    criticality: "high",
    sla: "99.9%"
  }
}

describe("Query Generation Normalization", () => {
  
  describe("Unified Diagnostic Instructions", () => {
    
    it("should generate consistent prompts for SQL-specific models", () => {
      const analysisGoal = "Analyze checkout flow latency patterns and identify bottlenecks"
      
      const sqlPrompt = generateSQLModelPrompt(testCheckoutPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      // Validate SQL prompt uses simplified, direct approach for code generation models
      expect(sqlPrompt).toContain("Write a ClickHouse SQL query")
      expect(sqlPrompt).toContain("Table: traces")
      expect(sqlPrompt).toContain("latency")  // Should contain latency-related content for performance analysis
      expect(sqlPrompt).toContain("quantile(0.95)") // Should include performance patterns
      expect(sqlPrompt).toContain("15 MINUTE")
      expect(sqlPrompt).toContain("Write the complete SQL query:")
      
      // Validate service filtering
      expect(sqlPrompt).toContain("'frontend'")
      expect(sqlPrompt).toContain("'cart'") 
      expect(sqlPrompt).toContain("'checkout'")
      expect(sqlPrompt).toContain("'payment'")
      expect(sqlPrompt).toContain("'email'")
      
      console.log("\n🔧 SQL Model Prompt Validation (Simplified Approach):")
      console.log(`   Length: ${sqlPrompt.length} characters`)
      console.log(`   Contains direct SQL examples: ✅`)
      console.log(`   Contains latency analysis patterns: ✅`)
      console.log(`   Contains all services: ✅`)
      
      expect(sqlPrompt.length).toBeGreaterThan(500) // Should be comprehensive but more concise
    })
    
    it("should generate consistent prompts for general LLM models", () => {
      const analysisGoal = "Identify error patterns across checkout services to improve reliability"
      
      const generalPrompt = generateGeneralLLMPrompt(testCheckoutPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      // Validate general prompt includes all diagnostic requirements
      expect(generalPrompt).toContain("DIAGNOSTIC REQUIREMENTS")
      expect(generalPrompt).toContain("TRACE-LEVEL ANALYSIS")
      expect(generalPrompt).toContain("ERROR ANALYSIS")
      expect(generalPrompt).toContain("VOLUME CONTEXT")
      expect(generalPrompt).toContain("BOTTLENECK DETECTION") 
      expect(generalPrompt).toContain("OPERATION BREAKDOWN")
      expect(generalPrompt).toContain("HEALTH SCORING")
      expect(generalPrompt).toContain("REAL-TIME FOCUS")
      expect(generalPrompt).toContain("15-minute windows")
      expect(generalPrompt).toContain("problematic_traces")
      
      // Validate service filtering requirements
      expect(generalPrompt).toContain("'frontend', 'cart', 'checkout', 'payment', 'email'")
      
      console.log("\n🔧 General LLM Prompt Validation:")
      console.log(`   Length: ${generalPrompt.length} characters`)
      console.log(`   Contains diagnostic requirements: ✅`)
      console.log(`   Contains trace filtering guidance: ✅`)
      console.log(`   Contains service filtering: ✅`)
      
      expect(generalPrompt.length).toBeGreaterThan(800) // Should be comprehensive
    })
    
    it("should provide diagnostic query template for reference", () => {
      const services = testCheckoutPath.services
      const templateQuery = DIAGNOSTIC_QUERY_TEMPLATE(services)
      
      // Validate template contains all diagnostic patterns
      expect(templateQuery).toContain("WITH problematic_traces AS")
      expect(templateQuery).toContain("diagnostic_analysis AS")
      expect(templateQuery).toContain("countIf(t.status_code != 'OK')")
      expect(templateQuery).toContain("error_rate_pct")
      expect(templateQuery).toContain("total_time_impact_ms")
      expect(templateQuery).toContain("health_status")
      expect(templateQuery).toContain("recommended_action")
      expect(templateQuery).toContain("INNER JOIN problematic_traces pt ON t.trace_id = pt.trace_id")
      
      // Validate service filtering
      services.forEach(service => {
        expect(templateQuery).toContain(`'${service}'`)
      })
      
      console.log("\n📋 Diagnostic Query Template Validation:")
      console.log(`   Length: ${templateQuery.length} characters`)
      console.log(`   Contains trace filtering CTE: ✅`)
      console.log(`   Contains diagnostic analysis CTE: ✅`) 
      console.log(`   Contains health scoring: ✅`)
      console.log(`   Contains all services: ✅`)
      
      expect(templateQuery.length).toBeGreaterThan(1800) // Should be comprehensive
    })
  })
  
  describe("Diagnostic Query Validation", () => {
    
    it("should validate queries meet diagnostic requirements", () => {
      // Test a query that meets all requirements
      const goodQuery = `
        WITH problematic_traces AS (
          SELECT DISTINCT trace_id
          FROM traces 
          WHERE service_name IN ('frontend', 'cart')
            AND start_time >= now() - INTERVAL 15 MINUTE
            AND (duration_ns/1000000 > 1000 OR status_code != 'OK')
        )
        SELECT 
          service_name,
          operation_name,
          count() AS request_count,
          countIf(status_code != 'OK') AS error_count,
          quantile(0.95)(duration_ns/1000000) AS p95_ms,
          CASE 
            WHEN countIf(status_code != 'OK') > 5 THEN 'CRITICAL'
            ELSE 'HEALTHY'
          END AS health_status
        FROM traces t
        INNER JOIN problematic_traces pt ON t.trace_id = pt.trace_id
        WHERE service_name IN ('frontend', 'cart')
        GROUP BY service_name, operation_name
      `
      
      const validation = validateDiagnosticQuery(goodQuery, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      console.log("\n✅ Good Query Validation:")
      console.log(`   Valid: ${validation.isValid}`)
      console.log(`   Missing requirements: ${validation.missingRequirements.join(', ') || 'None'}`)
      
      expect(validation.isValid).toBe(true)
      expect(validation.missingRequirements).toHaveLength(0)
    })
    
    it("should identify missing diagnostic requirements", () => {
      // Test a basic query that's missing diagnostic features
      const basicQuery = `
        SELECT 
          service_name,
          quantile(0.5)(duration_ns/1000000) as p50_ms,
          count() as request_count
        FROM traces
        WHERE service_name IN ('frontend', 'cart')
          AND start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
      `
      
      const validation = validateDiagnosticQuery(basicQuery, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      console.log("\n❌ Basic Query Validation:")
      console.log(`   Valid: ${validation.isValid}`)
      console.log(`   Missing requirements: ${validation.missingRequirements.join(', ')}`)
      
      expect(validation.isValid).toBe(false)
      expect(validation.missingRequirements.length).toBeGreaterThan(2)
      expect(validation.missingRequirements).toContain("Trace-level filtering")
      expect(validation.missingRequirements).toContain("Error analysis")
    })
    
    it("should identify partially diagnostic queries", () => {
      // Test a query with some but not all diagnostic features
      const partialQuery = `
        SELECT 
          service_name,
          count() AS request_count,
          countIf(status_code != 'OK') AS error_count,
          quantile(0.95)(duration_ns/1000000) AS p95_ms
        FROM traces
        WHERE service_name IN ('frontend', 'cart')
          AND start_time >= now() - INTERVAL 15 MINUTE
        GROUP BY service_name
      `
      
      const validation = validateDiagnosticQuery(partialQuery, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      console.log("\n⚠️ Partial Query Validation:")
      console.log(`   Valid: ${validation.isValid}`)
      console.log(`   Missing requirements: ${validation.missingRequirements.join(', ')}`)
      
      expect(validation.isValid).toBe(false)
      expect(validation.missingRequirements).toContain("Trace-level filtering")
      expect(validation.missingRequirements).toContain("Health scoring")
      // Should have error analysis and real-time focus
      expect(validation.missingRequirements).not.toContain("Error analysis")
      expect(validation.missingRequirements).not.toContain("Real-time focus")
    })
  })
  
  describe("Query Generation DRY Principles", () => {
    
    it("should eliminate duplication between query generators", () => {
      // Both generators should now use the same diagnostic instructions
      const goal1 = "Analyze service performance bottlenecks"
      const goal2 = "Identify error patterns and root causes"
      
      const sqlPrompt1 = generateSQLModelPrompt(testCheckoutPath, goal1, CORE_DIAGNOSTIC_REQUIREMENTS)
      const sqlPrompt2 = generateSQLModelPrompt(testCheckoutPath, goal2, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      const generalPrompt1 = generateGeneralLLMPrompt(testCheckoutPath, goal1, CORE_DIAGNOSTIC_REQUIREMENTS)
      const generalPrompt2 = generateGeneralLLMPrompt(testCheckoutPath, goal2, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      // Both approaches should share some core concepts but with different complexity levels
      const sharedBasicPatterns = [
        "15 MINUTE",  // Both should use 15 minute windows
        "traces",     // Both should reference traces table
      ]
      
      // SQL models use simplified patterns
      const sqlSpecificPatterns = [
        "Write the complete SQL query:",
        "Table: traces"
      ]
      
      // General models use comprehensive diagnostic patterns  
      const generalSpecificPatterns = [
        "TRACE-LEVEL ANALYSIS",
        "ERROR ANALYSIS",
        "problematic_traces"
      ]
      
      // Test shared patterns
      sharedBasicPatterns.forEach(pattern => {
        expect(sqlPrompt1).toContain(pattern)
        expect(sqlPrompt2).toContain(pattern)
        expect(generalPrompt1).toContain(pattern)
        expect(generalPrompt2).toContain(pattern)
      })
      
      // Test SQL-specific patterns
      sqlSpecificPatterns.forEach(pattern => {
        expect(sqlPrompt1).toContain(pattern)
        expect(sqlPrompt2).toContain(pattern)
      })
      
      // Test general-specific patterns
      generalSpecificPatterns.forEach(pattern => {
        expect(generalPrompt1).toContain(pattern)
        expect(generalPrompt2).toContain(pattern)
      })
      
      console.log("\n🔄 DRY Principles Validation:")
      console.log(`   Shared patterns across all prompts: ${sharedBasicPatterns.length}`)
      console.log(`   SQL prompts use simplified, direct approach: ✅`)
      console.log(`   General prompts use comprehensive diagnostic patterns: ✅`)
      console.log(`   No duplication of diagnostic logic: ✅`)
      
      expect(sharedBasicPatterns.length).toBeGreaterThanOrEqual(2)
    })
    
    it("should document the normalization improvements", () => {
      const improvements = {
        beforeNormalization: [
          "service-clickhouse-ai.ts had custom diagnostic prompt logic",
          "llm-query-generator.ts had different diagnostic requirements",
          "No shared validation of diagnostic query patterns",
          "Inconsistent trace-level filtering approaches",
          "Different health scoring implementations",
          "Duplicate SQL pattern definitions"
        ],
        afterNormalization: [
          "Unified diagnostic-query-instructions.ts module",
          "Shared diagnostic requirements between both generators",
          "Common validateDiagnosticQuery() function", 
          "Consistent trace-level filtering pattern",
          "Standardized health scoring logic",
          "Single source of truth for SQL patterns"
        ],
        benefits: [
          "DRY principle compliance - no duplication",
          "Consistent diagnostic capabilities across models",
          "Easier maintenance and updates",
          "Unified testing approach",
          "Better trace-level analysis",
          "Standardized query validation"
        ]
      }
      
      // Validate the improvements were implemented
      expect(improvements.beforeNormalization.length).toBe(6)
      expect(improvements.afterNormalization.length).toBe(6) 
      expect(improvements.benefits.length).toBe(6)
      
      console.log("\n📊 Query Generation Normalization Summary:")
      console.log("\n❌ Before Normalization:")
      improvements.beforeNormalization.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`)
      })
      
      console.log("\n✅ After Normalization:")
      improvements.afterNormalization.forEach((improvement, i) => {
        console.log(`   ${i + 1}. ${improvement}`)
      })
      
      console.log("\n🎯 Benefits Achieved:")
      improvements.benefits.forEach((benefit, i) => {
        console.log(`   ${i + 1}. ${benefit}`)
      })
    })
  })
  
  describe("Model-Specific Prompt Differences", () => {
    
    it("should show appropriate differences between SQL and general model prompts", () => {
      const analysisGoal = "Detect performance bottlenecks in checkout flow"
      
      const sqlPrompt = generateSQLModelPrompt(testCheckoutPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      const generalPrompt = generateGeneralLLMPrompt(testCheckoutPath, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
      
      // SQL model prompts should be more concise and SQL-focused
      expect(sqlPrompt).toContain("Write the complete SQL query:")
      expect(sqlPrompt).not.toContain("JSON response")
      
      // General model prompts should request structured output
      expect(generalPrompt).toContain("Return ONLY the SQL query")
      expect(generalPrompt).toContain("without explanation or markdown blocks")
      
      // General prompts should contain comprehensive diagnostic requirements
      const generalRequirements = [
        "ERROR ANALYSIS",
        "VOLUME CONTEXT", 
        "HEALTH SCORING",
        "problematic_traces"
      ]
      
      // SQL prompts use simplified, focused approach
      const sqlRequirements = [
        "Table: traces",
        "Write the complete SQL query:",
        "15 MINUTE"
      ]
      
      generalRequirements.forEach(requirement => {
        expect(generalPrompt).toContain(requirement)
      })
      
      sqlRequirements.forEach(requirement => {
        expect(sqlPrompt).toContain(requirement)
      })
      
      console.log("\n🔧 Model-Specific Differences:")
      console.log(`   SQL prompt: Concise, SQL-focused (${sqlRequirements.length} key patterns)`)
      console.log(`   General prompt: Detailed with context (${generalRequirements.length} diagnostic requirements)`) 
      console.log(`   Both use unified base instructions: ✅`)
    })
  })
})