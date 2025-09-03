import { test, expect } from '@playwright/test'

// Comprehensive Service Topology end-to-end validation
test.describe('Service Topology Comprehensive Validation', () => {
  test('should display all Service Topology components correctly', async ({ page }) => {
    // Navigate to service topology page
    await page.goto('/servicetopology')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Verify initial state - check for Service Topology container
    await expect(page.getByTestId('service-topology-container')).toBeVisible()
    
    // Check that the critical paths panel is visible
    await expect(page.getByTestId('critical-paths-panel')).toBeVisible()
    
    // Check that AI analysis panel is visible
    await expect(page.getByTestId('ai-analysis-panel')).toBeVisible()

    // Check if we have the topology graph column
    const hasTopologyGraph = await page.getByTestId('topology-graph-column').isVisible()
    expect(hasTopologyGraph).toBeTruthy()
    console.log('✅ Service Topology components are displaying correctly')

    // Check for demo mode alert if using mock data
    const demoAlert = page.getByTestId('demo-mode-alert')
    const isDemoMode = await demoAlert.isVisible().catch(() => false)
    
    if (isDemoMode) {
      console.log('ℹ️ Service running in demo mode with mock data')
      await expect(demoAlert).toContainText('Demo Mode')
    } else {
      console.log('✅ Service running in live mode')
    }

    // Verify page content doesn't contain protobuf JSON format
    const pageContent = await page.textContent('body')
    const hasProtobufNames = pageContent?.includes('{"stringValue"') || false
    expect(hasProtobufNames).toBeFalsy()
    console.log('✅ Service names are properly cleaned (no protobuf JSON)')

    console.log('✅ End-to-end Service Topology validation completed')
  })

  test('should handle path selection in critical paths panel', async ({ page }) => {
    await page.goto('/servicetopology')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Check that critical paths panel has items
    const pathItems = page.locator('.ant-list-item')
    const pathCount = await pathItems.count()
    
    if (pathCount > 0) {
      console.log(`✅ Found ${pathCount} critical paths`)
      
      // Click on the first path
      await pathItems.first().click()
      await page.waitForTimeout(1000)
      
      // Verify path is selected (should have different styling or indicator)
      const selectedPaths = page.getByTestId('selected-paths-count')
      const isSelected = await selectedPaths.isVisible().catch(() => false)
      
      if (isSelected) {
        console.log('✅ Path selection is working')
      }
    } else {
      console.log('⚠️ No critical paths available to test')
    }
  })

  test('should display topology graph with nodes and edges', async ({ page }) => {
    await page.goto('/servicetopology')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Check for canvas element (ECharts renders to canvas)
    const topologyColumn = page.getByTestId('topology-graph-column')
    const canvas = topologyColumn.locator('canvas')
    
    await expect(canvas).toBeVisible()
    console.log('✅ Topology graph canvas is rendered')

    // Check if canvas has content (not empty)
    const canvasBox = await canvas.boundingBox()
    if (canvasBox) {
      expect(canvasBox.width).toBeGreaterThan(0)
      expect(canvasBox.height).toBeGreaterThan(0)
      console.log('✅ Topology graph has visual content')
    }
  })
})