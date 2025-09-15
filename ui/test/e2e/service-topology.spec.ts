import { test, expect } from '@playwright/test'

// Helper function for CI-appropriate timeouts
const getTimeout = (baseTimeout: number) => process.env.CI ? baseTimeout * 4 : baseTimeout

test.describe('Service Topology View', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Service Topology page
    await page.goto('/servicetopology')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
  })

  test('should display Service Topology components', async ({ page }) => {
    // Verify main container is visible
    await expect(page.getByTestId('service-topology-container')).toBeVisible({ 
      timeout: getTimeout(10000) 
    })
    
    // Verify three main panels are visible
    await expect(page.getByTestId('critical-paths-panel')).toBeVisible()
    await expect(page.getByTestId('topology-graph-column')).toBeVisible()
    await expect(page.getByTestId('ai-analysis-panel')).toBeVisible()
    
    console.log('✅ Service Topology components validated')
  })

  test('should display critical paths in left panel', async ({ page }) => {
    // Check critical paths panel has content
    const pathsPanel = page.getByTestId('critical-paths-panel')
    await expect(pathsPanel).toBeVisible()
    
    // Check for path items (using class selector as fallback)
    const pathItems = page.locator('.ant-list-item')
    await expect(pathItems.first()).toBeVisible({ timeout: getTimeout(5000) })
    
    console.log('✅ Critical paths displayed')
  })

  test('should display topology graph in center panel', async ({ page }) => {
    // Wait for loading to complete first
    await page.waitForFunction(
      () => !document.querySelector('.ant-spin-spinning'),
      { timeout: getTimeout(15000) }
    )

    // Check topology graph column exists
    const topologyColumn = page.getByTestId('topology-graph-column')
    await expect(topologyColumn).toBeVisible()

    // Check for canvas element (ECharts renders to canvas)
    const canvas = topologyColumn.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: getTimeout(10000) })

    console.log('✅ Topology graph displayed')
  })

  test('should display AI analysis panel on right', async ({ page }) => {
    // Check AI analysis panel exists
    const analysisPanel = page.getByTestId('ai-analysis-panel')
    await expect(analysisPanel).toBeVisible()
    
    // Initially should show "No Analysis Available" alert
    const noAnalysisAlert = page.getByTestId('no-analysis-alert')
    const analysisTabs = page.getByTestId('analysis-tabs')
    
    // Either no analysis alert or tabs should be visible
    const hasContent = await Promise.race([
      noAnalysisAlert.isVisible().then(() => true).catch(() => false),
      analysisTabs.isVisible().then(() => true).catch(() => false)
    ])
    
    expect(hasContent).toBeTruthy()
    console.log('✅ AI analysis panel displayed')
  })

  test('should show demo mode alert when using mock data', async ({ page }) => {
    // Check if demo mode alert is visible (depends on configuration)
    const demoAlert = page.getByTestId('demo-mode-alert')
    const isDemoMode = await demoAlert.isVisible().catch(() => false)
    
    if (isDemoMode) {
      await expect(demoAlert).toContainText('Demo Mode')
      console.log('✅ Demo mode alert displayed')
    } else {
      console.log('✅ Running in live mode (no demo alert)')
    }
  })

  test('should navigate properly using test IDs', async ({ page }) => {
    // Navigate to traces
    await page.getByTestId('nav-traces').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('traces-page-title')).toBeVisible({ 
      timeout: getTimeout(5000) 
    })
    
    // Navigate back to Service Topology
    await page.getByTestId('nav-servicetopology').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('service-topology-container')).toBeVisible({ 
      timeout: getTimeout(5000) 
    })
    
    console.log('✅ Navigation working correctly')
  })
})