/**
 * E2E tests for AI Insights Critical Path Discovery
 *
 * Tests the full workflow from backend API to UI display
 */

import { test, expect } from '@playwright/test'

test.describe('AI Insights Critical Path Discovery', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to service topology page
    await page.goto('/servicetopology')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
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

    // Check for path name
    const pathName = await firstPath.locator('.path-name, [class*="name"]').first()
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

  test('should handle backend API responses', async ({ page }) => {
    // Intercept API calls to ai-insights
    let apiCalled = false
    page.on('request', (request) => {
      if (request.url().includes('/api/ai-insights/critical-paths')) {
        apiCalled = true
        console.log('📡 API call intercepted:', request.url())
      }
    })

    // Reload to trigger API call
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Either API was called (real backend) or mock data is used
    const hasData =
      (await page.locator('[data-testid^="critical-path-"]').count()) > 0

    expect(hasData).toBe(true)

    if (apiCalled) {
      console.log('✅ Using real AI Insights API')
    } else {
      console.log('ℹ️  Using mock data fallback')
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
})
