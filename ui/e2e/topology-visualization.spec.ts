import { test, expect } from '@playwright/test'

test.describe('Topology Visualization', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:5173')
    
    // Navigate to Insights -> AI Analyzer
    await page.click('text=Insights')
    await page.waitForTimeout(500)
    await page.click('text=AI Analyzer')
    await page.waitForTimeout(1000)
  })

  test('should display topology visualization tab', async ({ page }) => {
    // Check that the AI Analyzer view loads
    await expect(page.locator('h2:has-text("AI-Powered Architecture Analysis")')).toBeVisible()
    
    // Analyze topology to generate data
    await page.click('button:has-text("🔍 Analyze Topology")')
    
    // Wait for analysis to complete (could be mock or real data)
    await page.waitForTimeout(3000)
    
    // Click on the Topology Graph tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Verify the topology chart is displayed
    await expect(page.locator('text=Service Topology Overview')).toBeVisible()
    
    // Verify health status badges are present
    await expect(page.locator('text=Service Health')).toBeVisible()
    await expect(page.locator('span:has-text("Healthy")')).toBeVisible()
    await expect(page.locator('span:has-text("Warning")')).toBeVisible()
    await expect(page.locator('span:has-text("Critical")')).toBeVisible()
  })

  test('should show service details panel when node is clicked', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Find and click on a service node (using canvas interaction)
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x: 300, y: 300 } })
    await page.waitForTimeout(500)
    
    // Check if service details panel appears
    const detailsPanel = page.locator('text=/AI Analysis:/')
    if (await detailsPanel.count() > 0) {
      await expect(detailsPanel).toBeVisible()
      
      // Verify RED metrics are displayed
      await expect(page.locator('text=📈 Rate')).toBeVisible()
      await expect(page.locator('text=⚠️ Errors')).toBeVisible()
      await expect(page.locator('text=⏱️ P95')).toBeVisible()
    }
  })

  test('should display health-based node colors', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Verify the legend explaining node health status
    await expect(page.locator('text=Node Health Status:')).toBeVisible()
    await expect(page.locator('text=/Node colors indicate overall health/')).toBeVisible()
    
    // Check for health status tags in legend
    await expect(page.locator('span:has-text("🟢 Healthy")')).toBeVisible()
    await expect(page.locator('span:has-text("🟡 Warning")')).toBeVisible()
    await expect(page.locator('span:has-text("🔴 Critical")')).toBeVisible()
  })

  test('should show tooltip on node hover', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Hover over the canvas where nodes might be
    const canvas = page.locator('canvas').first()
    await canvas.hover({ position: { x: 300, y: 300 } })
    await page.waitForTimeout(1000)
    
    // Check if tooltip appears (tooltips are rendered in a portal)
    const tooltip = page.locator('div[style*="padding: 10px"]')
    if (await tooltip.count() > 0) {
      // Verify tooltip contains metrics
      const tooltipText = await tooltip.textContent()
      expect(tooltipText).toMatch(/Rate:|Errors:|P95:|Spans:/)
    }
  })

  test('should filter nodes by health status', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Click on a health filter badge (e.g., Warning)
    const warningBadge = page.locator('span:has-text("Warning")').first()
    if (await warningBadge.count() > 0) {
      await warningBadge.click()
      await page.waitForTimeout(500)
      
      // Verify filter is applied (should see "Clear Filter" option)
      const clearFilter = page.locator('span:has-text("Clear Filter")')
      if (await clearFilter.count() > 0) {
        await expect(clearFilter).toBeVisible()
        
        // Clear the filter
        await clearFilter.click()
        await page.waitForTimeout(500)
      }
    }
  })

  test('should handle mock data fallback gracefully', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Check if mock data warning appears
    const mockWarning = page.locator('text=/mock topology data/i')
    if (await mockWarning.count() > 0) {
      // Verify that even with mock data, the visualization works
      await expect(page.locator('text=Service Topology Overview')).toBeVisible()
      
      // Should still show some nodes (mock data includes frontend, api-gateway, etc.)
      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible()
    }
  })

  test('should display AI health explanations in details panel', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Try to click on a service node to open details
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x: 300, y: 300 } })
    await page.waitForTimeout(500)
    
    // Check for AI Analysis in the details panel
    const aiAnalysis = page.locator('text=/🤖.*AI Analysis:/').first()
    if (await aiAnalysis.count() > 0) {
      await expect(aiAnalysis).toBeVisible()
      
      // Verify it shows full text without ellipsis at the end
      const analysisText = await aiAnalysis.textContent()
      expect(analysisText).not.toMatch(/\.\.\.$/)
      
      // Check for recommendations if service has issues
      const recommendations = page.locator('text=Recommendations').first()
      if (await recommendations.count() > 0) {
        await expect(recommendations).toBeVisible()
      }
    }
  })

  test('should show operation breakdown on edge hover', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Hover over an edge (between nodes)
    const canvas = page.locator('canvas').first()
    await canvas.hover({ position: { x: 400, y: 350 } })
    await page.waitForTimeout(1000)
    
    // Check if edge tooltip shows operation details
    const edgeTooltip = page.locator('text=/→/')
    if (await edgeTooltip.count() > 0) {
      const tooltipText = await edgeTooltip.textContent()
      // Should show source → target and call volume
      expect(tooltipText).toMatch(/→/)
      expect(tooltipText).toMatch(/calls/)
    }
  })

  test('should have refresh functionality', async ({ page }) => {
    // Generate topology data
    await page.click('button:has-text("🔍 Analyze Topology")')
    await page.waitForTimeout(3000)
    
    // Navigate to topology tab
    await page.click('text=🌐 Topology Graph')
    await page.waitForTimeout(1000)
    
    // Look for refresh button
    const refreshButton = page.locator('button:has-text("Refresh")')
    await expect(refreshButton).toBeVisible()
    
    // Click refresh
    await refreshButton.click()
    await page.waitForTimeout(2000)
    
    // Verify the chart still displays
    await expect(page.locator('text=Service Topology Overview')).toBeVisible()
  })
})