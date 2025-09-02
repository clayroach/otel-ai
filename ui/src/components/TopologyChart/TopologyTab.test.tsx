import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMockTopologyData } from './TopologyTab'

// This test file validates that mock and real data are properly separated

describe('Mock vs Real Data Separation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Mock Data Validation', () => {
    it('should have all mock services prefixed with "m"', () => {
      const mockData = getMockTopologyData()

      // All nodes should have 'm' prefix
      mockData.nodes.forEach((node) => {
        expect(node.id).toMatch(/^m/)
        expect(node.name).toMatch(/^m/)
        console.log(`Mock node validated: ${node.name}`)
      })
    })

    it('should have all mock edges reference prefixed node IDs', () => {
      const mockData = getMockTopologyData()

      // All edges should reference nodes with 'm' prefix
      mockData.edges.forEach((edge) => {
        expect(edge.source).toMatch(/^m/)
        expect(edge.target).toMatch(/^m/)
        console.log(`Mock edge validated: ${edge.source} -> ${edge.target}`)
      })
    })

    it('should contain expected mock services', () => {
      const mockData = getMockTopologyData()
      const nodeNames = mockData.nodes.map((n) => n.name)

      // Check for key mock services
      const expectedMockServices = [
        'mfrontend',
        'mcartservice',
        'mcheckoutservice',
        'mpaymentservice',
        'mpostgres',
        'mredis'
      ]

      expectedMockServices.forEach((service) => {
        expect(nodeNames).toContain(service)
      })
    })

    it('should NOT contain any real service names', () => {
      const mockData = getMockTopologyData()
      const nodeNames = mockData.nodes.map((n) => n.name)

      // Real service names (without 'm' prefix) should NOT exist
      const realServices = [
        'frontend',
        'cartservice',
        'checkoutservice',
        'paymentservice',
        'postgres',
        'redis'
      ]

      realServices.forEach((service) => {
        expect(nodeNames).not.toContain(service)
      })
    })

    it('should have consistent node and edge references', () => {
      const mockData = getMockTopologyData()
      const nodeIds = new Set(mockData.nodes.map((n) => n.id))

      // Every edge should reference existing nodes
      mockData.edges.forEach((edge) => {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      })
    })
  })

  describe('Data Separation Rules', () => {
    it('mock data should be completely separate from real data namespace', () => {
      const mockData = getMockTopologyData()

      // Create a hypothetical real data structure
      const realData = {
        nodes: [
          { id: 'frontend', name: 'frontend' },
          { id: 'cartservice', name: 'cartservice' }
        ]
      }

      // Node IDs should never overlap
      const mockIds = new Set(mockData.nodes.map((n) => n.id))
      const realIds = new Set(realData.nodes.map((n) => n.id))

      // No intersection between mock and real IDs
      const intersection = Array.from(mockIds).filter((id) => realIds.has(id))
      expect(intersection).toHaveLength(0)
    })

    it('should be easy to identify data source by service name', () => {
      const mockData = getMockTopologyData()

      // All mock services should be immediately identifiable
      mockData.nodes.forEach((node) => {
        const isMockData = node.name.startsWith('m')
        expect(isMockData).toBe(true)
      })

      // Real data should NOT have the prefix
      const realServiceName = 'frontend'
      expect(realServiceName.startsWith('m')).toBe(false)
    })
  })

  describe('Mock Data Structure', () => {
    it('should have valid metrics for all nodes', () => {
      const mockData = getMockTopologyData()

      mockData.nodes.forEach((node) => {
        expect(node.metrics).toBeDefined()
        expect(node.metrics.rate).toBeGreaterThanOrEqual(0)
        expect(node.metrics.errorRate).toBeGreaterThanOrEqual(0)
        expect(node.metrics.duration).toBeGreaterThanOrEqual(0)
        expect(node.metrics.spanCount).toBeGreaterThanOrEqual(0)
      })
    })

    it('should have valid edge properties', () => {
      const mockData = getMockTopologyData()

      mockData.edges.forEach((edge) => {
        expect(edge.value).toBeGreaterThan(0)
        expect(edge.lineStyle).toBeDefined()
        expect(edge.lineStyle.width).toBeGreaterThan(0)
        expect(edge.lineStyle.color).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })

    it('should have health summary', () => {
      const mockData = getMockTopologyData()

      expect(mockData.healthSummary).toBeDefined()
      expect(mockData.healthSummary.healthy).toBeGreaterThanOrEqual(0)
      expect(mockData.healthSummary.warning).toBeGreaterThanOrEqual(0)
      expect(mockData.healthSummary.critical).toBeGreaterThanOrEqual(0)
    })
  })
})

// Export for reuse in other tests
export function validateMockServiceName(name: string): boolean {
  return name.startsWith('m')
}

export function validateRealServiceName(name: string): boolean {
  return !name.startsWith('m')
}
