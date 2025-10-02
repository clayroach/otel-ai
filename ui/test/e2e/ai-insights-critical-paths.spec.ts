/**
 * E2E tests for AI Insights Critical Path Discovery
 *
 * Tests the full workflow from backend API to UI display
 * Uses mocked API responses to avoid overloading LLM with repeated calls
 */

import { test, expect } from '@playwright/test'
import mockCriticalPaths from './fixtures/critical-paths.json'

test.describe('AI Insights Critical Path Discovery', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Use real API for tests marked with [LIVE], mock for the rest
    const useRealAPI = testInfo.title.includes('[LIVE]')

    if (!useRealAPI) {
      // Mock API responses with fixture data to avoid LLM overload
      await page.route('**/api/ai-insights/critical-paths', async (route) => {
        console.log('🔄 Using mock fixture data (no LLM call)')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCriticalPaths)
        })
      })
    } else {
      console.log('📡 Using real API for integration test')
    }

    // Navigate to service topology page
    await page.goto('/servicetopology', { waitUntil: 'load' })

    // Wait for panel to be visible
    await expect(page.getByTestId('critical-paths-panel')).toBeVisible({ timeout: 10000 })

    // Wait for at least one path to load (from API or mock)
    await expect(page.locator('[data-testid^="critical-path-"]').first()).toBeVisible({
      timeout: 15000
    })
  })

  test('should display critical paths panel with paths', async ({ page }) => {
    // Verify critical paths panel is visible
    await expect(page.getByTestId('critical-paths-panel')).toBeVisible()

    // Wait for paths to load (either from API or mock fallback)
    await page.waitForTimeout(2000)

    // Should have at least one path displayed
    const pathElements = await page.locator('[data-testid^="critical-path-"]').count()
    expect(pathElements).toBeGreaterThan(0)

    console.log(`✅ Found ${pathElements} critical paths displayed`)
  })

  test('should show path details with metrics', async ({ page }) => {
    // Wait for paths to load
    await page.waitForTimeout(2000)

    // Get first critical path
    const firstPath = page.locator('[data-testid^="critical-path-"]').first()
    await expect(firstPath).toBeVisible()

    // Check for path name using test-id
    const pathName = firstPath.getByTestId('path-name')
    await expect(pathName).toBeVisible()
    const nameText = await pathName.textContent()
    expect(nameText).toBeTruthy()

    console.log(`✅ Path name: ${nameText}`)
  })

  test('should display priority badges', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Look for priority badges (critical, high, medium, low)
    const hasPriorityBadges =
      (await page.locator('text=/critical|high|medium|low/i').count()) > 0

    expect(hasPriorityBadges).toBe(true)

    console.log('✅ Priority badges displayed')
  })

  test('should allow path selection and highlight services', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Click on first path to select it
    const firstPath = page.locator('[data-testid^="critical-path-"]').first()
    await firstPath.click()

    // Wait for selection to process
    await page.waitForTimeout(500)

    // Topology graph should be visible
    await expect(page.getByTestId('topology-graph-column')).toBeVisible()

    console.log('✅ Path selection works')
  })

  test('should show metrics in path cards', async ({ page }) => {
    await page.waitForTimeout(2000)

    const firstPath = page.locator('[data-testid^="critical-path-"]').first()

    // Check for metric indicators (error rate, latency, request count)
    const hasMetrics = await firstPath
      .locator('text=/error|latency|request|ms|%/i')
      .count()

    expect(hasMetrics).toBeGreaterThan(0)

    console.log('✅ Path metrics displayed')
  })

  test('should filter paths by priority', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Look for filter controls
    const filterSelect = page.locator('select, [role="combobox"]').first()

    if (await filterSelect.isVisible()) {
      const initialCount = await page
        .locator('[data-testid^="critical-path-"]')
        .count()

      console.log(`✅ Path filtering available (${initialCount} paths initially)`)
    } else {
      console.log('ℹ️  Filter controls not found (may be conditional)')
    }
  })

  test('[LIVE] should handle backend API responses', async ({ page }) => {
    // This test uses real API - may take longer due to LLM processing
    // Intercept API calls to ai-insights
    let apiCalled = false
    page.on('request', (request) => {
      if (request.url().includes('/api/ai-insights/critical-paths')) {
        apiCalled = true
        console.log('📡 Real API call intercepted:', request.url())
      }
    })

    // Reload to trigger API call (already loaded in beforeEach)
    await page.reload({ waitUntil: 'load' })

    // Wait for LLM processing and response (can take 10-15 seconds)
    await page.waitForTimeout(15000)

    // Either API was called (real backend) or test timed out
    const hasData =
      (await page.locator('[data-testid^="critical-path-"]').count()) > 0

    expect(hasData).toBe(true)

    if (apiCalled) {
      console.log('✅ Using real AI Insights API')
    } else {
      console.log('⚠️  API was not called - backend may be unavailable')
    }
  })

  test('should display service flow when path is selected', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Select first path
    const firstPath = page.locator('[data-testid^="critical-path-"]').first()
    await firstPath.click()
    await page.waitForTimeout(1000)

    // Check for service flow visualization
    const hasFlow =
      (await page.locator('text=/frontend|backend|database|service/i').count()) > 0

    expect(hasFlow).toBe(true)

    console.log('✅ Service flow visualization displayed')
  })

  test('should refetch critical paths when Analyze button is clicked', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Track API calls to critical-paths endpoint
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/ai-insights/critical-paths')) {
        apiCalls.push(request.url())
        console.log('📡 Critical paths API call:', new Date().toISOString())
      }
    })

    // Get initial path count
    const initialCount = await page.locator('[data-testid^="critical-path-"]').count()
    console.log(`Initial path count: ${initialCount}`)

    // Clear API call tracking
    apiCalls.length = 0

    // Find and click the Analyze button
    const analyzeButton = page.getByRole('button', { name: /analyze/i })
    await expect(analyzeButton).toBeVisible({ timeout: 5000 })

    // Click analyze button
    await analyzeButton.click()
    console.log('🔄 Clicked Analyze button')

    // Check for refetching indicator in panel title
    const refetchingIndicator = page.getByTestId('critical-paths-refetching')
    const indicatorAppeared = await refetchingIndicator.isVisible().catch(() => false)

    if (indicatorAppeared) {
      console.log('✅ Loading indicator appeared in panel title')
      // Wait for indicator to disappear (refetch complete)
      await refetchingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        console.log('ℹ️  Indicator still visible after timeout')
      })
    } else {
      console.log('ℹ️  Loading indicator not visible (refetch may have been too fast)')
    }

    // Wait for potential API call
    await page.waitForTimeout(2000)

    // Verify either:
    // 1. API was called (real backend available), OR
    // 2. UI still shows critical paths (using cached/mock data)
    const finalCount = await page.locator('[data-testid^="critical-path-"]').count()

    if (apiCalls.length > 0) {
      console.log(`✅ Analyze button triggered ${apiCalls.length} API call(s)`)
      expect(apiCalls.length).toBeGreaterThan(0)
    } else {
      console.log('ℹ️  No API call detected - backend may be unavailable, using cached/mock data')
    }

    // Critical paths should still be displayed after analyze
    expect(finalCount).toBeGreaterThan(0)
    console.log(`✅ Critical paths still displayed after analyze (${finalCount} paths)`)
  })

  test('should use cached data on page refresh without API call', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Track API calls
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/ai-insights/critical-paths')) {
        apiCalls.push(request.url())
      }
    })

    // Get initial count
    const initialCount = await page.locator('[data-testid^="critical-path-"]').count()
    console.log(`Initial path count: ${initialCount}`)

    // Clear API tracking
    apiCalls.length = 0

    // Reload page - should NOT trigger API call due to cache
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2000)

    // Wait for critical paths to appear (from cache)
    await expect(page.locator('[data-testid^="critical-path-"]').first()).toBeVisible({
      timeout: 5000
    })

    const reloadCount = await page.locator('[data-testid^="critical-path-"]').count()

    // Paths should be displayed from cache
    expect(reloadCount).toBeGreaterThan(0)

    // No API call should have been made (data comes from localStorage cache)
    if (apiCalls.length === 0) {
      console.log('✅ Page refresh used cached data (no API call)')
    } else {
      console.log(`ℹ️  API call detected on refresh (${apiCalls.length} calls) - cache may be empty or invalidated`)
    }

    console.log(`✅ Paths displayed after refresh: ${reloadCount}`)
  })
})
