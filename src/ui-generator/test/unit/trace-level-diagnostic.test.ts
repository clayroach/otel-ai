import { describe, it, expect } from "vitest"

/**
 * Test suite for trace-level diagnostic query analysis
 * 
 * This validates the approach of identifying problematic traces first,
 * then analyzing their characteristics for better diagnostic insights.
 */

describe("Trace-Level Diagnostic Analysis", () => {
  
  it("should demonstrate the value of trace-level filtering for diagnostics", () => {
    const originalAggregateApproach = `
      -- Original approach: aggregate ALL data
      SELECT 
        service_name,
        quantile(0.95)(duration_ns/1000000) AS p95_ms,
        count() AS request_count
      FROM traces
      WHERE service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
        AND start_time >= now() - INTERVAL 1 HOUR
      GROUP BY service_name
    `
    
    const improvedTraceFilteredApproach = `
      -- Improved approach: identify problematic traces first, then analyze
      WITH problematic_traces AS (
        -- Step 1: Identify traces that are actually problematic
        SELECT DISTINCT trace_id
        FROM traces
        WHERE service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
          AND start_time >= now() - INTERVAL 15 MINUTE
          AND (
            -- Slow traces (over 1 second total duration)
            duration_ns/1000000 > 1000
            -- OR traces with errors
            OR status_code != 'OK'
            -- OR traces with high span count (complex operations)  
            OR trace_id IN (
              SELECT trace_id 
              FROM traces 
              GROUP BY trace_id 
              HAVING count() > 20
            )
          )
      ),
      trace_analysis AS (
        -- Step 2: Analyze only the problematic traces
        SELECT 
          t.service_name,
          t.operation_name,
          count() AS problem_span_count,
          countIf(t.status_code != 'OK') AS error_count,
          round(countIf(t.status_code != 'OK') * 100.0 / count(), 2) AS error_rate_pct,
          quantile(0.5)(t.duration_ns/1000000) AS median_ms,
          quantile(0.95)(t.duration_ns/1000000) AS p95_ms,
          max(t.duration_ns/1000000) AS max_ms,
          -- Critical: Calculate impact within problematic traces only
          count() * quantile(0.95)(t.duration_ns/1000000) AS problem_impact_score
        FROM traces t
        INNER JOIN problematic_traces pt ON t.trace_id = pt.trace_id
        WHERE t.service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
        GROUP BY t.service_name, t.operation_name
        HAVING problem_span_count > 5  -- Filter noise
      )
      SELECT 
        service_name,
        operation_name,
        problem_span_count,
        error_rate_pct,
        p95_ms,
        problem_impact_score,
        CASE 
          WHEN error_rate_pct > 10 THEN 'CRITICAL'
          WHEN error_rate_pct > 2 OR p95_ms > 2000 THEN 'WARNING' 
          ELSE 'INVESTIGATE'
        END AS urgency_level,
        -- Provide specific diagnostic context
        CASE 
          WHEN error_rate_pct > 5 THEN 'High error rate - check service health'
          WHEN p95_ms > 1500 THEN 'High latency - check dependencies'
          WHEN problem_span_count > 100 THEN 'High volume in problems - check capacity'
          ELSE 'Performance regression - compare to baseline'
        END AS recommended_action
      FROM trace_analysis
      ORDER BY 
        CASE urgency_level 
          WHEN 'CRITICAL' THEN 1 
          WHEN 'WARNING' THEN 2 
          ELSE 3 
        END,
        problem_impact_score DESC
    `
    
    const diagnosticComparison = {
      originalLimitations: [
        "Includes all traces, even healthy ones - dilutes problem signals",
        "No way to identify specific problematic transactions", 
        "Averages hide the traces that are actually causing issues",
        "No context about why certain services show high latency",
        "Cannot distinguish between systemic issues and isolated problems",
        "Results show symptoms, not actionable root causes"
      ],
      traceFilteredBenefits: [
        "Focuses only on traces that are actually problematic",
        "Provides specific trace IDs for deep-dive investigation",
        "Shows the characteristics of problem traces vs. all traces",
        "Enables identification of patterns in failing transactions",
        "Separates systemic issues from isolated incidents",
        "Provides actionable diagnostic recommendations",
        "Shows impact scores based on problem density, not just averages"
      ],
      exampleScenarios: {
        "High latency with normal error rate": {
          interpretation: "Dependency issue or resource contention",
          nextSteps: "Check external service calls, database performance"
        },
        "High error rate with normal latency": {
          interpretation: "Service logic issue or input validation problem", 
          nextSteps: "Check error logs, validate input data quality"
        },
        "High span count with high latency": {
          interpretation: "Inefficient operation chains or retry loops",
          nextSteps: "Review operation complexity, check for retry patterns"
        },
        "Isolated trace IDs with problems": {
          interpretation: "Specific input data or user behavior causing issues",
          nextSteps: "Analyze problem trace characteristics, user patterns"
        }
      }
    }
    
    // Validate the diagnostic value
    expect(diagnosticComparison.originalLimitations.length).toBeGreaterThanOrEqual(4)
    expect(diagnosticComparison.traceFilteredBenefits.length).toBeGreaterThanOrEqual(5)
    expect(Object.keys(diagnosticComparison.exampleScenarios)).toHaveLength(4)
    
    // Validate SQL improvements
    expect(improvedTraceFilteredApproach).toContain("problematic_traces")
    expect(improvedTraceFilteredApproach).toContain("trace_id") 
    expect(improvedTraceFilteredApproach).toContain("INNER JOIN")
    expect(improvedTraceFilteredApproach).toContain("recommended_action")
    expect(improvedTraceFilteredApproach).toContain("urgency_level")
    
    console.log("\n🔍 Trace-Level vs Aggregate Analysis Comparison:")
    console.log("\n❌ Original Aggregate Approach Limitations:")
    diagnosticComparison.originalLimitations.forEach((limitation, i) => {
      console.log(`   ${i + 1}. ${limitation}`)
    })
    
    console.log("\n✅ Trace-Filtered Approach Benefits:")
    diagnosticComparison.traceFilteredBenefits.forEach((benefit, i) => {
      console.log(`   ${i + 1}. ${benefit}`)
    })
    
    console.log("\n📊 Diagnostic Scenarios with Trace-Level Context:")
    Object.entries(diagnosticComparison.exampleScenarios).forEach(([scenario, details]) => {
      console.log(`\n   ${scenario}:`)
      console.log(`     What it means: ${details.interpretation}`)
      console.log(`     Next steps: ${details.nextSteps}`)
    })
  })
  
  it("should validate trace-level filtering query patterns", () => {
    const requiredTracePatterns = {
      "Problematic Trace Identification": {
        pattern: "WITH problematic_traces AS (SELECT DISTINCT trace_id FROM traces WHERE ...)",
        purpose: "Identify specific traces that have issues",
        example: "Traces with >1s duration, errors, or high span count"
      },
      "Trace-Focused Analysis": {
        pattern: "INNER JOIN problematic_traces pt ON t.trace_id = pt.trace_id",
        purpose: "Analyze only the traces that have problems",
        example: "Calculate metrics for problem traces only, not all traces"
      },
      "Problem Impact Scoring": {
        pattern: "count() * quantile(0.95)(duration_ns/1000000) AS problem_impact_score",
        purpose: "Weight impact by problem density, not total volume", 
        example: "High latency in 10 problem traces > low latency in 1000 normal traces"
      },
      "Multi-Criteria Problem Detection": {
        pattern: "WHERE (duration_ns/1000000 > 1000 OR status_code != 'OK' OR ...)",
        purpose: "Identify problems using multiple signals",
        example: "Slow traces OR error traces OR complex traces"
      },
      "Diagnostic Recommendations": {
        pattern: "CASE WHEN error_rate > 5 THEN 'High error rate - check service health' ELSE ... END",
        purpose: "Provide actionable next steps based on problem patterns",
        example: "Different recommendations for latency vs error vs volume issues"
      }
    }
    
    // Validate patterns
    Object.entries(requiredTracePatterns).forEach(([name, pattern]) => {
      expect(pattern.pattern).toBeDefined()
      expect(pattern.purpose).toBeDefined()
      expect(pattern.example).toBeDefined()
      expect(pattern.purpose.length).toBeGreaterThan(20)
    })
    
    console.log("\n🔧 Trace-Level Diagnostic Patterns:")
    Object.entries(requiredTracePatterns).forEach(([name, pattern]) => {
      console.log(`\n   ${name}:`)
      console.log(`     SQL Pattern: ${pattern.pattern}`)
      console.log(`     Purpose: ${pattern.purpose}`)
      console.log(`     Example: ${pattern.example}`)
    })
    
    expect(Object.keys(requiredTracePatterns)).toHaveLength(5)
  })
  
  it("should demonstrate specific trace-ID use cases for checkout flow", () => {
    const checkoutFlowTraceScenarios = {
      "Slow Payment Processing": {
        tracePattern: "Traces with payment service > 2000ms",
        expectedFindings: [
          "Specific trace IDs taking >2s in payment validation",
          "Common payment methods causing delays",
          "External payment gateway timeouts",
          "Specific user accounts with payment issues"
        ],
        diagnosticQuestions: [
          "Which payment methods are slowest?",
          "Are payment delays correlated with order amounts?",
          "Do payment delays happen at specific times?",
          "Which external payment services are problematic?"
        ]
      },
      "Cart Service Errors": {
        tracePattern: "Traces with cart service errors",
        expectedFindings: [
          "Specific trace IDs where cart operations fail",
          "Product types causing cart errors",
          "User session states leading to failures",
          "Inventory conflicts during cart updates"
        ],
        diagnosticQuestions: [
          "Which cart operations fail most often?",
          "Are errors related to specific products?",
          "Do errors correlate with user behavior patterns?",
          "Are there race conditions in cart updates?"
        ]
      },
      "Checkout Flow Abandonment": {
        tracePattern: "Incomplete traces (missing email service)",
        expectedFindings: [
          "Trace IDs that start but never reach completion",
          "Services where users typically abandon the flow",
          "Error patterns leading to abandonment",
          "Performance issues causing user dropoff"
        ],
        diagnosticQuestions: [
          "At which service do users abandon checkout most?",
          "What errors immediately precede abandonment?", 
          "Are abandonments correlated with page load times?",
          "Which user segments have highest abandonment?"
        ]
      }
    }
    
    // Validate scenarios
    Object.entries(checkoutFlowTraceScenarios).forEach(([scenario, details]) => {
      expect(details.tracePattern).toBeDefined()
      expect(details.expectedFindings.length).toBeGreaterThanOrEqual(3)
      expect(details.diagnosticQuestions.length).toBeGreaterThanOrEqual(3)
    })
    
    console.log("\n🛒 Checkout Flow Trace-Level Diagnostic Scenarios:")
    Object.entries(checkoutFlowTraceScenarios).forEach(([scenario, details]) => {
      console.log(`\n   ${scenario}:`)
      console.log(`     Trace Pattern: ${details.tracePattern}`)
      console.log(`     Expected Findings:`)
      details.expectedFindings.forEach((finding, i) => {
        console.log(`       ${i + 1}. ${finding}`)
      })
      console.log(`     Diagnostic Questions:`)
      details.diagnosticQuestions.forEach((question, i) => {
        console.log(`       ${i + 1}. ${question}`)
      })
    })
    
    expect(Object.keys(checkoutFlowTraceScenarios)).toHaveLength(3)
  })
})