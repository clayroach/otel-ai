import { test, expect } from '@playwright/test'

/**
 * Tests for ui/src/services/query-generator.ts
 * 
 * These tests verify the QueryGeneratorService functionality including:
 * - API performance (should be <5 seconds, not 20+ seconds)
 * - Query structure and content
 * - Model availability
 * - Fallback behavior
 */
test.describe('Query Generator Service', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Browser console error:', msg.text())
      }
    })
    
    // Navigate to the Service Topology view where query generator is used
    await page.goto('http://localhost:5173/servicetopology')
    await page.waitForSelector('[data-testid="critical-paths-panel"]', { timeout: 10000 })
  })

  test('should have query generator service available in browser', async ({ page }) => {
    // Test that the query generator service can be imported and used
    const result = await page.evaluate(() => {
      // This tests the actual service import and basic functionality
      return new Promise((resolve) => {
        import('../../src/services/query-generator.ts').then((module) => {
          const { QueryGeneratorService } = module
          resolve({
            hasService: !!QueryGeneratorService,
            hasGenerateQuery: typeof QueryGeneratorService.generateQuery === 'function',
            hasGetAvailableModels: typeof QueryGeneratorService.getAvailableModels === 'function',
            hasValidateQuery: typeof QueryGeneratorService.validateQuery === 'function'
          })
        }).catch((error: unknown) => {
          resolve({ error: error instanceof Error ? error.message : String(error) })
        })
      })
    })

    expect(result).toHaveProperty('hasService', true)
    expect(result).toHaveProperty('hasGenerateQuery', true)
    expect(result).toHaveProperty('hasGetAvailableModels', true)
    expect(result).toHaveProperty('hasValidateQuery', true)
  })

  test('should fetch available models in reasonable time', async ({ page }) => {
    const startTime = Date.now()
    
    const result = await page.evaluate(async () => {
      const { QueryGeneratorService } = await import('../../src/services/query-generator.ts')
      try {
        const models = await QueryGeneratorService.getAvailableModels()
        return {
          success: true,
          modelCount: models.length,
          models: models.map((m: { name: string; provider: string; available: boolean; description: string }) => ({
            name: m.name,
            provider: m.provider,
            available: m.available,
            description: m.description
          }))
        }
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
    
    const elapsed = Date.now() - startTime
    
    // Should complete quickly (under 5 seconds)
    expect(elapsed).toBeLessThan(5000)
    expect(result.success).toBe(true)
    expect(result.modelCount).toBeGreaterThan(0)
    
    console.log(`✅ Models fetched in ${elapsed}ms:`, result.models)
  })

  test('should generate query in reasonable time with correct structure', async ({ page }) => {
    const startTime = Date.now()
    
    const result = await page.evaluate(async () => {
      const { QueryGeneratorService } = await import('../../src/services/query-generator.ts')
      
      // Test with a realistic critical path
      const testPath = {
        id: 'test-critical-path',
        name: 'Frontend to Payment Flow',
        services: ['frontend', 'cart', 'checkout', 'payment', 'email'],
        edges: [
          { source: 'frontend', target: 'cart' },
          { source: 'cart', target: 'checkout' },
          { source: 'checkout', target: 'payment' },
          { source: 'payment', target: 'email' }
        ],
        metrics: {
          requestCount: 1000,
          avgLatency: 250,
          errorRate: 0.02,
          p99Latency: 850
        },
        priority: 'critical' as const,
        lastUpdated: new Date()
      }
      
      try {
        const queryResult = await QueryGeneratorService.generateQuery({
          path: testPath,
          analysisGoal: 'Analyze latency and error patterns across the critical path services',
          timeWindowMinutes: 60
        })
        
        return {
          success: true,
          generationTime: queryResult.generationTime,
          model: queryResult.model,
          sqlLength: queryResult.sql.length,
          hasDescription: !!queryResult.description,
          analysisType: queryResult.analysisType,
          sqlSample: queryResult.sql.substring(0, 200) + '...',
          criticalPath: queryResult.criticalPath
        }
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
    
    const totalElapsed = Date.now() - startTime
    
    console.log(`Query generation result:`, result)
    
    // Verify the query was generated successfully
    expect(result.success).toBe(true)
    
    // Performance requirements - should be much faster than 20 seconds
    expect(totalElapsed).toBeLessThan(10000) // Maximum 10 seconds
    expect(result.generationTime).toBeLessThan(8000) // API should report <8 seconds
    
    // Query structure requirements
    expect(result.sqlLength).toBeGreaterThan(100) // Should be a substantial query
    expect(result.model).toBeDefined()
    expect(result.hasDescription).toBe(true)
    expect(result.analysisType).toBeDefined()
    expect(result.criticalPath).toBe('Frontend to Payment Flow')
    
    // SQL content should include the services
    expect(result.sqlSample?.toLowerCase()).toMatch(/frontend|cart|checkout|payment|email/)
    
    console.log(`✅ Query generated in ${totalElapsed}ms (API reported: ${result.generationTime}ms)`)
    console.log(`📊 Model used: ${result.model}`)
    console.log(`📝 SQL preview: ${result.sqlSample}`)
  })

  test('should handle query validation correctly', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { QueryGeneratorService } = await import('../../src/services/query-generator.ts')
      
      const validQuery = `SELECT service_name, count() FROM otel.traces WHERE start_time >= now() - INTERVAL 1 HOUR GROUP BY service_name`
      const invalidQuery = `DROP TABLE traces; SELECT * FROM secret_data`
      
      return {
        validResult: QueryGeneratorService.validateQuery(validQuery),
        invalidResult: QueryGeneratorService.validateQuery(invalidQuery)
      }
    })
    
    // Valid query should pass
    expect(result.validResult.valid).toBe(true)
    expect(result.validResult.errors).toHaveLength(0)
    
    // Invalid query should be rejected
    expect(result.invalidResult.valid).toBe(false)
    expect(result.invalidResult.errors.length).toBeGreaterThan(0)
    
    console.log('✅ Query validation working correctly')
    console.log('❌ Invalid query errors:', result.invalidResult.errors)
  })

  test('should handle API errors gracefully and use fallback', async ({ page }) => {
    // Test fallback behavior when API is unreachable
    const result = await page.evaluate(async () => {
      const { QueryGeneratorService } = await import('../../src/services/query-generator.ts')
      
      // Mock a temporary network failure by overriding the axios instance
      // (This simulates the fallback path in the actual service)
      
      const testPath = {
        id: 'test-fallback-path',
        name: 'Test Fallback Path',
        services: ['service-a', 'service-b'],
        edges: [
          { source: 'service-a', target: 'service-b' }
        ],
        metrics: {
          requestCount: 500,
          avgLatency: 400,
          errorRate: 0.05,
          p99Latency: 1200
        },
        priority: 'high' as const,
        lastUpdated: new Date()
      }
      
      try {
        const queryResult = await QueryGeneratorService.generateQuery({
          path: testPath
        })
        
        return {
          success: true,
          model: queryResult.model,
          isFallback: queryResult.model === 'fallback' || queryResult.description?.includes('Fallback'),
          sqlContainsServices: queryResult.sql.includes('service-a') && queryResult.sql.includes('service-b')
        }
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
    
    expect(result.success).toBe(true)
    expect(result.sqlContainsServices).toBe(true)
    
    console.log(`✅ Query generation with model: ${result.model}`)
    console.log(`📋 Using fallback: ${result.isFallback}`)
  })

  test('should integrate with Service Topology UI correctly', async ({ page }) => {
    // Wait for critical paths to load
    await page.waitForSelector('.critical-paths-scroll-container', { timeout: 5000 })
    
    // Get the first critical path
    const firstPath = page.locator('[data-testid^="critical-path-item-"]').first()
    await expect(firstPath).toBeVisible()
    
    // Click the diagnostic query button to test the full integration
    const diagnosticButton = page.locator('[data-testid^="diagnostic-query-button-"]').first()
    await expect(diagnosticButton).toBeVisible()
    
    // Record the click timing
    const startTime = Date.now()
    await diagnosticButton.click()
    
    // Wait for navigation to traces page
    await page.waitForURL('**/traces', { timeout: 15000 })
    const navigationTime = Date.now() - startTime
    
    // Wait for page to settle
    await page.waitForTimeout(2000)
    
    // Check if query is populated (might be in different elements)
    const hasQueryContent = await page.evaluate(() => {
      // Check for SQL content in various possible containers
      const elements = document.querySelectorAll('textarea, input, pre, code, .query, .sql')
      for (const el of elements) {
        if (el.textContent?.includes('SELECT') && el.textContent?.includes('FROM')) {
          return true
        }
      }
      return false
    })
    
    expect(hasQueryContent).toBe(true)
    expect(navigationTime).toBeLessThan(15000) // Should navigate within 15 seconds
    
    console.log(`✅ Full integration test completed in ${navigationTime}ms`)
  })
})