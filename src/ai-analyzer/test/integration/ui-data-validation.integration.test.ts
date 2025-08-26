/**
 * UI Data Validation Integration Tests
 * 
 * Tests the actual data that the UI receives to ensure it matches what users see.
 * This validates the complete data pipeline from backend to UI display.
 */

import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE_URL = process.env.API_URL || 'http://localhost:4319'

// Helper function to wait for sufficient data for architecture analysis
async function waitForUIAnalysisData(minSpans = 50, maxWaitMs = 15000): Promise<any> {
  const startWait = Date.now()
  
  while (Date.now() - startWait < maxWaitMs) {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000)
      
      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })
      
      if (response.ok) {
        const analysis = await response.json()
        if (analysis.metadata?.analyzedSpans >= minSpans && 
            analysis.architecture?.services?.length > 0) {
          console.log(`✅ UI Analysis: Found ${analysis.metadata.analyzedSpans} spans and ${analysis.architecture.services.length} services`)
          return analysis
        }
      }
      
      // Wait 2 seconds before retry
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  // Final attempt with extended time range
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 4 * 60 * 60 * 1000)
  
  const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'architecture',
      timeRange: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    })
  })
  
  if (response.ok) {
    const analysis = await response.json()
    console.log(`⚠️ UI Final attempt: ${analysis.metadata?.analyzedSpans || 0} spans, ${analysis.architecture?.services?.length || 0} services`)
    return analysis
  }
  
  throw new Error(`Failed to get UI analysis data after ${maxWaitMs}ms`)
}
const TEST_TIMEOUT = 30000

describe('UI Data Validation Integration', () => {
  
  beforeAll(async () => {
    // Wait for services to be ready
    console.log('🔄 Waiting for AI Analyzer to be ready...')
    const maxRetries = 20
    let retries = 0
    
    while (retries < maxRetries) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/health`)
        if (response.ok) {
          console.log('✅ AI Analyzer service is ready')
          break
        }
      } catch (error) {
        console.log(`⚠️ Service not ready yet (attempt ${retries + 1}/${maxRetries})`)
      }
      
      retries++
      if (retries === maxRetries) {
        throw new Error('AI Analyzer service did not become ready in time')
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }, TEST_TIMEOUT)

  describe('UI Service Display Data', () => {
    it('should return clean service names without JSON objects', async () => {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000)
      
      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })
      
      expect(response.ok).toBe(true)
      const analysis = await response.json() as any
      
      console.log('🔍 Full analysis response for UI validation:')
      console.log(JSON.stringify(analysis, null, 2))
      
      // Check service names are clean strings, not JSON objects
      for (const service of analysis.architecture.services) {
        console.log(`📋 Service name: "${service.service}"`)
        
        // Should not be a JSON string
        expect(service.service.startsWith('{')).toBe(false)
        expect(service.service.includes('$typeName')).toBe(false)
        expect(service.service.includes('opentelemetry.proto')).toBe(false)
        
        // Should be a reasonable service name
        expect(service.service.length).toBeLessThan(100)
        expect(service.service.length).toBeGreaterThan(0)
      }
    }, TEST_TIMEOUT)

    it('should return properly formatted span counts for UI display', async () => {
      // Wait for sufficient telemetry data before testing UI display
      const analysis = await waitForUIAnalysisData(30, 15000) // Wait for at least 30 spans
      
      // Check analyzedSpans field that UI displays with "spans" suffix
      const analyzedSpans = analysis.metadata.analyzedSpans
      console.log(`📊 UI will display: "${analyzedSpans}spans"`)
      
      // Validate this won't create the weird concatenation UI issue
      if (typeof analyzedSpans === 'string') {
        // Should not already contain commas (BigInt concatenation)
        expect(analyzedSpans.includes(',')).toBe(false)
        expect(analyzedSpans.length).toBeLessThan(10) // Should be reasonable length
        
        const parsed = parseInt(analyzedSpans, 10)
        expect(parsed).toBeGreaterThan(0)
        expect(parsed).toBeLessThan(1000000)
        
        console.log(`✅ analyzedSpans will display cleanly: "${parsed}spans"`)
      } else {
        expect(typeof analyzedSpans).toBe('number')
        expect(analyzedSpans).toBeGreaterThan(0)
        expect(analyzedSpans).toBeLessThan(1000000)
        
        console.log(`✅ analyzedSpans will display cleanly: "${analyzedSpans}spans"`)
      }
      
      // Check individual service totalSpans
      for (const service of analysis.architecture.services) {
        const totalSpans = service.metadata.totalSpans
        console.log(`📈 Service "${service.service}" totalSpans: ${totalSpans}`)
        
        if (typeof totalSpans === 'string') {
          expect(totalSpans.includes(',')).toBe(false)
          const parsed = parseInt(totalSpans, 10)
          expect(parsed).toBeGreaterThan(0)
        } else {
          expect(typeof totalSpans).toBe('number')
          expect(totalSpans).toBeGreaterThan(0)
        }
      }
    }, TEST_TIMEOUT)

    it('should match UI expectation for service discovery summary', async () => {
      // Wait for sufficient telemetry data before testing service discovery
      const analysis = await waitForUIAnalysisData(50, 15000) // Wait for at least 50 spans
      
      const servicesCount = analysis.architecture.services.length
      const dataFlowsCount = analysis.architecture.dataFlows.length
      const criticalPathsCount = analysis.architecture.criticalPaths.length
      const appName = analysis.architecture.applicationName
      
      console.log(`🎯 UI Summary Check:`)
      console.log(`   Services: ${servicesCount}`)
      console.log(`   Data Flows: ${dataFlowsCount}`)
      console.log(`   Critical Paths: ${criticalPathsCount}`)
      console.log(`   App Name: "${appName}"`)
      
      // UI displays: "Discovered X services with Y data flows and identified Z critical paths in your [AppName] application."
      const expectedMessage = `Discovered ${servicesCount} services with ${dataFlowsCount} data flows and identified ${criticalPathsCount} critical paths in your ${appName} application.`
      console.log(`📱 Expected UI message: "${expectedMessage}"`)
      
      // Validate the data makes sense for UI display
      expect(servicesCount).toBeGreaterThan(0)
      expect(typeof dataFlowsCount).toBe('number')
      expect(typeof criticalPathsCount).toBe('number')
      expect(appName).toBeTruthy()
      expect(appName.length).toBeGreaterThan(0)
      
      // If we see "Discovered 1 services with 0 data flows" it suggests an issue
      if (servicesCount === 1 && dataFlowsCount === 0) {
        console.log('⚠️ Low discovery results - this might indicate data flow issues')
        
        // Log the raw service data to understand the issue
        console.log('🔍 Raw service data:')
        analysis.architecture.services.forEach((service: any, index: number) => {
          console.log(`   Service ${index + 1}:`, JSON.stringify(service, null, 4))
        })
      }
    }, TEST_TIMEOUT)

    it('should validate service metadata fields are UI-ready', async () => {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000)
      
      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })
      
      expect(response.ok).toBe(true)
      const analysis = await response.json() as any
      
      // Check each service's metadata for UI display
      for (const [index, service] of analysis.architecture.services.entries()) {
        console.log(`🔧 Service ${index + 1} metadata validation:`)
        console.log(`   Name: "${service.service}"`)
        console.log(`   Type: "${service.type}"`)
        console.log(`   Operations: ${service.operations.length}`)
        console.log(`   Dependencies: ${service.dependencies.length}`)
        
        const metadata = service.metadata
        console.log(`   Avg Latency: ${metadata.avgLatencyMs}ms`)
        console.log(`   Error Rate: ${metadata.errorRate}`)
        console.log(`   Total Spans: ${metadata.totalSpans}`)
        
        // Validate metadata is UI-ready
        if (metadata.avgLatencyMs !== undefined) {
          expect(typeof metadata.avgLatencyMs).toBe('number')
          expect(metadata.avgLatencyMs).toBeGreaterThanOrEqual(0)
        }
        
        if (metadata.errorRate !== undefined) {
          expect(typeof metadata.errorRate).toBe('number')
          expect(metadata.errorRate).toBeGreaterThanOrEqual(0)
          expect(metadata.errorRate).toBeLessThanOrEqual(1)
        }
        
        // Validate operations and dependencies are arrays
        expect(Array.isArray(service.operations)).toBe(true)
        expect(Array.isArray(service.dependencies)).toBe(true)
      }
    }, TEST_TIMEOUT)
  })

  describe('UI Topology Data', () => {
    it('should return clean topology data for service list display', async () => {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000)
      
      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/topology`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })
      
      expect(response.ok).toBe(true)
      const topology = await response.json() as any
      
      console.log(`🗂️ Topology data for UI service list (${topology.length} services):`)
      
      // Validate each service in the topology
      for (const [index, service] of topology.entries()) {
        console.log(`   ${index + 1}. "${service.service}" (${service.type})`)
        
        // Check service name is clean
        expect(service.service.startsWith('{')).toBe(false)
        expect(service.service.includes('$typeName')).toBe(false)
        
        // Check metadata
        if (service.metadata && service.metadata.totalSpans) {
          const spans = service.metadata.totalSpans
          if (typeof spans === 'string') {
            expect(spans.includes(',')).toBe(false)
          }
          console.log(`      Spans: ${spans}`)
        }
      }
    }, TEST_TIMEOUT)
  })
})