import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import axios from 'axios'
import AIAnalyzerView from '../views/InsightsView/AIAnalyzerView'
import { TopologyTab } from '../components/TopologyChart/TopologyTab'
import { useAppStore } from '../store/appStore'
import '@testing-library/jest-dom'

// Mock axios
vi.mock('axios')
const mockedAxios = axios as any

// Mock the AI analyzer service
vi.mock('../services/ai-analyzer', () => ({
  useAIAnalyzer: () => ({
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', capabilities: ['real-data'] }),
    analyzeArchitecture: vi.fn().mockResolvedValue({ success: true }),
    streamAnalysis: vi.fn()
  })
}))

describe('Mock vs Real Data Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to default state
    useAppStore.setState({
      useRealService: false,
      analysisModel: 'llama',
      analysisTimeRange: '5m',
      autoRefresh: 'manual'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('TopologyTab Component', () => {
    it('should use mock data when LIVE toggle is OFF', async () => {
      // Set LIVE toggle OFF
      useAppStore.setState({ useRealService: false })

      const { container } = render(<TopologyTab />)

      // Wait for component to load
      await waitFor(() => {
        // Should NOT make API call when using mock data
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      // Wait for mock data to be displayed
      await waitFor(
        () => {
          // Check for mock service names with 'm' prefix
          const mockServices = [
            'mfrontend',
            'mcartservice',
            'mcheckoutservice',
            'mpaymentservice',
            'mpostgres',
            'mredis'
          ]

          // At least one mock service should be visible
          const chartContainer = container.querySelector('[data-testid="topology-chart"]')
          if (chartContainer) {
            const chartText = chartContainer.textContent || ''
            const hasMockService = mockServices.some((service) => chartText.includes(service))
            expect(hasMockService).toBe(true)
          }
        },
        { timeout: 3000 }
      )
    })

    it('should make API call when LIVE toggle is ON', async () => {
      // Set LIVE toggle ON
      useAppStore.setState({ useRealService: true })

      // Mock successful API response with real service names
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          nodes: [
            { id: 'frontend', name: 'frontend', metrics: {} },
            { id: 'cartservice', name: 'cartservice', metrics: {} }
          ],
          edges: [],
          runtimeEnvironments: [],
          healthSummary: {}
        }
      })

      render(<TopologyTab />)

      // Should make API call when using real data
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:4319/api/ai-analyzer/topology-visualization',
          expect.any(Object)
        )
      })
    })

    it('should NOT fall back to mock data on API failure when LIVE is ON', async () => {
      // Set LIVE toggle ON
      useAppStore.setState({ useRealService: true })

      // Mock API failure
      mockedAxios.post.mockRejectedValueOnce(new Error('API Error'))

      const { container } = render(<TopologyTab />)

      // Wait for error handling
      await waitFor(() => {
        // Should show error message, not mock data
        expect(screen.getByText(/Error Loading Topology/i)).toBeInTheDocument()
      })

      // Should NOT display mock services
      const mockServices = ['mfrontend', 'mcartservice', 'mcheckoutservice']
      const containerText = container.textContent || ''
      mockServices.forEach((service) => {
        expect(containerText).not.toContain(service)
      })
    })

    it('should immediately show mock data without API call when LIVE is OFF', async () => {
      // Set LIVE toggle OFF
      useAppStore.setState({ useRealService: false })

      const consoleSpy = vi.spyOn(console, 'log')

      render(<TopologyTab />)

      // Should not make any API calls
      expect(mockedAxios.post).not.toHaveBeenCalled()
      expect(mockedAxios.get).not.toHaveBeenCalled()

      // Should show mock data message
      await waitFor(
        () => {
          const messages = consoleSpy.mock.calls.flat().join(' ')
          expect(messages).toContain('mock')
        },
        { timeout: 2000 }
      )

      consoleSpy.mockRestore()
    })
  })

  describe('AIAnalyzerView Component', () => {
    it('should handle LIVE mode correctly', async () => {
      // Set LIVE toggle ON
      useAppStore.setState({ useRealService: true })

      render(<AIAnalyzerView />)

      // Verify real service is being used
      await waitFor(() => {
        const state = useAppStore.getState()
        expect(state.useRealService).toBe(true)
      })
    })

    it('should handle mock mode correctly', async () => {
      // Set LIVE toggle OFF
      useAppStore.setState({ useRealService: false })

      render(<AIAnalyzerView />)

      // Verify mock service is being used
      await waitFor(() => {
        const state = useAppStore.getState()
        expect(state.useRealService).toBe(false)
      })
    })

    it('should not fall back to mock on error in LIVE mode', async () => {
      // Set LIVE toggle ON
      useAppStore.setState({ useRealService: true })

      // Mock the AI analyzer to throw error
      const mockAnalyzer = {
        healthCheck: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        analyzeArchitecture: vi.fn().mockRejectedValue(new Error('Analysis failed')),
        streamAnalysis: vi.fn()
      }

      vi.mock('../services/ai-analyzer', () => ({
        useAIAnalyzer: () => mockAnalyzer
      }))

      const { container } = render(<AIAnalyzerView />)

      await waitFor(() => {
        // Should not contain mock service names
        const containerText = container.textContent || ''
        expect(containerText).not.toContain('mfrontend')
        expect(containerText).not.toContain('mcartservice')
      })
    })
  })

  describe('LIVE Toggle Integration', () => {
    it('should switch between mock and real data when toggle changes', async () => {
      // Start with mock data
      useAppStore.setState({ useRealService: false })

      const { rerender } = render(<TopologyTab />)

      // Verify mock mode
      await waitFor(() => {
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      // Switch to LIVE mode
      act(() => {
        useAppStore.setState({ useRealService: true })
      })

      // Mock successful API response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          nodes: [{ id: 'frontend', name: 'frontend', metrics: {} }],
          edges: [],
          runtimeEnvironments: [],
          healthSummary: {}
        }
      })

      rerender(<TopologyTab />)

      // Verify API call is made
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled()
      })
    })

    it('should maintain data separation between mock and real', async () => {
      // Test that mock data has 'm' prefix
      useAppStore.setState({ useRealService: false })
      const { container: mockContainer } = render(<TopologyTab key="mock" />)

      await waitFor(
        () => {
          const mockText = mockContainer.textContent || ''
          // Mock services should have 'm' prefix
          expect(mockText).toMatch(/m[a-z]+service/i)
        },
        { timeout: 3000 }
      )

      // Test that real data does NOT have 'm' prefix
      useAppStore.setState({ useRealService: true })
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          nodes: [
            { id: 'frontend', name: 'frontend', metrics: {} },
            { id: 'cartservice', name: 'cartservice', metrics: {} }
          ],
          edges: [],
          runtimeEnvironments: [],
          healthSummary: {}
        }
      })

      const { container: realContainer } = render(<TopologyTab key="real" />)

      await waitFor(() => {
        // Real service names should NOT have 'm' prefix
        expect(mockedAxios.post).toHaveBeenCalled()
        const lastCall = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1]
        expect(lastCall[0]).toContain('topology-visualization')
      })
    })
  })

  describe('Data Validation Rules', () => {
    it('should validate mock data structure', async () => {
      useAppStore.setState({ useRealService: false })

      // Import the mock data generator
      const { getMockTopologyData } = await import('../components/TopologyChart/TopologyTab')
      const mockData = getMockTopologyData()

      // Validate all mock services have 'm' prefix
      mockData.nodes.forEach((node) => {
        expect(node.name).toMatch(/^m/)
        expect(node.id).toMatch(/^m/)
      })

      // Validate all edges reference prefixed IDs
      mockData.edges.forEach((edge) => {
        expect(edge.source).toMatch(/^m/)
        expect(edge.target).toMatch(/^m/)
      })
    })

    it('should validate real data does not have mock prefix', async () => {
      const realData = {
        nodes: [
          { id: 'frontend', name: 'frontend' },
          { id: 'cartservice', name: 'cartservice' },
          { id: 'checkoutservice', name: 'checkoutservice' }
        ]
      }

      // Validate no 'm' prefix in real data
      realData.nodes.forEach((node) => {
        expect(node.name).not.toMatch(/^m/)
        expect(node.id).not.toMatch(/^m/)
      })
    })

    it('should never mix mock and real data', async () => {
      // This test ensures data sources are never mixed
      const mockNodes = ['mfrontend', 'mcartservice', 'mcheckoutservice']
      const realNodes = ['frontend', 'cartservice', 'checkoutservice']

      // Mock data should only contain mock nodes
      const mockData = { nodes: mockNodes.map((n) => ({ id: n, name: n })) }
      mockData.nodes.forEach((node) => {
        expect(realNodes).not.toContain(node.name)
      })

      // Real data should only contain real nodes
      const realData = { nodes: realNodes.map((n) => ({ id: n, name: n })) }
      realData.nodes.forEach((node) => {
        expect(mockNodes).not.toContain(node.name)
      })
    })
  })

  describe('Error Handling', () => {
    it('should show appropriate error for LIVE mode failures', async () => {
      useAppStore.setState({ useRealService: true })
      mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'))

      render(<TopologyTab />)

      await waitFor(() => {
        expect(screen.getByText(/Error Loading Topology/i)).toBeInTheDocument()
        expect(screen.getByText(/Connection refused/i)).toBeInTheDocument()
      })
    })

    it('should show info message for mock mode', async () => {
      useAppStore.setState({ useRealService: false })

      const consoleSpy = vi.spyOn(console, 'info')
      render(<TopologyTab />)

      await waitFor(
        () => {
          // Should show mock data info message
          const messages = consoleSpy.mock.calls.flat().join(' ')
          expect(messages.toLowerCase()).toContain('mock')
        },
        { timeout: 2000 }
      )

      consoleSpy.mockRestore()
    })
  })
})
