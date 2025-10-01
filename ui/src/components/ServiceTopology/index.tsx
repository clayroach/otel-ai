import React, { useState, useCallback } from 'react'
import { Row, Col, App } from 'antd'
import { CriticalPathsPanel } from './CriticalPathsPanel'
import { AIAnalysisPanel } from './AIAnalysisPanel'
import { ServiceTopologyPanel } from './ServiceTopologyPanel'
import { PathFlowChartPanel } from './PathFlowChartPanel'
import { useAppStore } from '../../store/appStore'
import type { CriticalPath, AnalysisTab, TopologyState, ServiceTopologyProps } from './types'
import './styles.css'

// Mock data generator for demonstration
const generateMockPaths = (): CriticalPath[] => {
  return [
    {
      id: 'path-1',
      name: 'Checkout Flow',
      description: 'User checkout process from cart to payment confirmation',
      services: ['frontend', 'cart', 'checkout', 'payment', 'email'],
      edges: [
        { source: 'frontend', target: 'cart' },
        { source: 'frontend', target: 'checkout' },
        { source: 'checkout', target: 'payment' },
        { source: 'checkout', target: 'email' }
      ],
      metrics: {
        requestCount: 1250,
        avgLatency: 450,
        errorRate: 0.002,
        p99Latency: 1200
      },
      priority: 'critical',
      lastUpdated: new Date()
    },
    {
      id: 'path-2',
      name: 'Product Search',
      description: 'Product search and recommendation flow',
      services: ['frontend', 'product-catalog', 'recommendation', 'ad'],
      edges: [
        { source: 'frontend', target: 'product-catalog' },
        { source: 'frontend', target: 'recommendation' },
        { source: 'recommendation', target: 'product-catalog' },
        { source: 'frontend', target: 'ad' }
      ],
      metrics: {
        requestCount: 5420,
        avgLatency: 120,
        errorRate: 0.001,
        p99Latency: 350
      },
      priority: 'high',
      lastUpdated: new Date()
    },
    {
      id: 'path-3',
      name: 'Currency Conversion',
      description: 'Currency conversion for pricing',
      services: ['frontend', 'currency', 'product-catalog'],
      edges: [
        { source: 'frontend', target: 'currency' },
        { source: 'product-catalog', target: 'currency' }
      ],
      metrics: {
        requestCount: 3200,
        avgLatency: 85,
        errorRate: 0.015,
        p99Latency: 250
      },
      priority: 'high',
      lastUpdated: new Date()
    },
    {
      id: 'path-4',
      name: 'Shipping Calculator',
      description: 'Calculate shipping costs and delivery times - HIGH ERROR RATE',
      services: ['frontend', 'shipping', 'currency'],
      edges: [
        { source: 'frontend', target: 'shipping' },
        { source: 'shipping', target: 'currency' }
      ],
      metrics: {
        requestCount: 890,
        avgLatency: 2100,
        errorRate: 0.08, // 8% error rate - critical
        p99Latency: 5500
      },
      priority: 'critical', // Changed to critical due to high error rate
      lastUpdated: new Date()
    },
    {
      id: 'path-5',
      name: 'Fraud Detection',
      description: 'Payment fraud detection flow',
      services: ['payment', 'fraud-detection', 'accounting'],
      edges: [
        { source: 'payment', target: 'fraud-detection' },
        { source: 'fraud-detection', target: 'accounting' }
      ],
      metrics: {
        requestCount: 150,
        avgLatency: 3500,
        errorRate: 0.001,
        p99Latency: 8000
      },
      priority: 'low',
      lastUpdated: new Date()
    }
  ]
}

const generateMockServices = () => {
  return [
    { id: 'frontend', name: 'Frontend', metrics: { rate: 250, errorRate: 0.001, duration: 45 } },
    { id: 'cart', name: 'Cart Service', metrics: { rate: 180, errorRate: 0.002, duration: 120 } },
    {
      id: 'checkout',
      name: 'Checkout Service',
      metrics: { rate: 150, errorRate: 0.003, duration: 200 }
    },
    {
      id: 'payment',
      name: 'Payment Service',
      metrics: { rate: 120, errorRate: 0.005, duration: 350 }
    },
    { id: 'email', name: 'Email Service', metrics: { rate: 100, errorRate: 0.001, duration: 80 } },
    {
      id: 'product-catalog',
      name: 'Product Catalog',
      metrics: { rate: 450, errorRate: 0.001, duration: 65 }
    },
    {
      id: 'recommendation',
      name: 'Recommendation',
      metrics: { rate: 320, errorRate: 0.002, duration: 150 }
    },
    { id: 'ad', name: 'Ad Service', metrics: { rate: 280, errorRate: 0.008, duration: 95 } },
    {
      id: 'currency',
      name: 'Currency Service',
      metrics: { rate: 200, errorRate: 0.015, duration: 55 }
    },
    {
      id: 'shipping',
      name: 'Shipping Service',
      metrics: { rate: 85, errorRate: 0.08, duration: 2100 }
    },
    {
      id: 'fraud-detection',
      name: 'Fraud Detection',
      metrics: { rate: 25, errorRate: 0.001, duration: 3500 }
    },
    { id: 'accounting', name: 'Accounting', metrics: { rate: 15, errorRate: 0.001, duration: 450 } }
  ]
}

const generateMockAnalysis = (
  type: 'global' | 'service',
  targetId?: string
): AnalysisTab['content'] => {
  const insights =
    type === 'global'
      ? [
          {
            id: 'insight-1',
            type: 'architecture' as const,
            title: 'Service Coupling Detected',
            description:
              'The checkout service has high coupling with 4 downstream services. Consider implementing an event-driven architecture to reduce direct dependencies.',
            severity: 'warning' as const
          },
          {
            id: 'insight-2',
            type: 'performance' as const,
            title: 'Shipping Service Bottleneck',
            description:
              'The shipping service shows P99 latency of 5.5s, significantly impacting the checkout flow. Database query optimization recommended.',
            severity: 'critical' as const
          },
          {
            id: 'insight-3',
            type: 'recommendation' as const,
            title: 'Implement Circuit Breaker',
            description:
              'Add circuit breaker pattern between frontend and payment service to handle failures gracefully.',
            severity: 'info' as const
          }
        ]
      : [
          {
            id: 'insight-s1',
            type: 'performance' as const,
            title: `${targetId} Response Time Analysis`,
            description: `Service ${targetId} shows 95th percentile latency of 450ms. Consider caching frequently accessed data.`,
            severity: 'warning' as const
          },
          {
            id: 'insight-s2',
            type: 'error' as const,
            title: 'Intermittent Connection Failures',
            description: `Detected 2.3% connection timeout rate to downstream services. Review connection pool settings.`,
            severity: 'warning' as const
          }
        ]

  return {
    summary:
      type === 'global'
        ? 'System analysis reveals 3 critical paths with performance bottlenecks. The shipping service is the primary concern with P99 latency exceeding 5 seconds.'
        : `Service ${targetId} handles ${Math.floor(Math.random() * 5000 + 1000)} requests per minute with 99.7% success rate. Performance optimization opportunities identified.`,
    insights,
    metrics:
      type === 'service'
        ? {
            requestRate: Math.floor(Math.random() * 100 + 50),
            errorRate: Math.random() * 5,
            latency: {
              p50: Math.floor(Math.random() * 100 + 50),
              p95: Math.floor(Math.random() * 300 + 150),
              p99: Math.floor(Math.random() * 500 + 300)
            },
            saturation: Math.floor(Math.random() * 100)
          }
        : undefined
  }
}

export const ServiceTopology: React.FC<ServiceTopologyProps> = ({
  paths: propsPaths,
  onPathSelect: propsOnPathSelect,
  onServiceClick: propsOnServiceClick,
  defaultPanelSizes = {
    paths: 15,
    topology: 55,
    analysis: 30
  },
  className = ''
}) => {
  const { message } = App.useApp()
  const { analysisTimeRange } = useAppStore()

  // Convert analysisTimeRange string to Date tuple
  const getTimeRange = (): [Date, Date] => {
    const end = new Date()
    const hoursMap: Record<string, number> = {
      '1m': 1 / 60,
      '5m': 5 / 60,
      '15m': 0.25,
      '30m': 0.5,
      '1h': 1,
      '3h': 3,
      '6h': 6,
      '12h': 12,
      '24h': 24
    }
    const hours = hoursMap[analysisTimeRange] || 24
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
    return [start, end]
  }

  // State management
  const [state, setState] = useState<TopologyState>({
    availablePaths: propsPaths || generateMockPaths(),
    selectedPaths: [],
    pathFilter: 'all',
    highlightedServices: new Set(),
    animationEnabled: true,
    activeTabs: [
      {
        id: 'global',
        type: 'global',
        title: 'System Overview',
        content: generateMockAnalysis('global')
      }
    ],
    activeTabId: 'global',
    panelSizes: {
      paths: defaultPanelSizes.paths || 15,
      topology: defaultPanelSizes.topology || 55,
      analysis: defaultPanelSizes.analysis || 30
    },
    isPanelCollapsed: {
      paths: false,
      analysis: false
    }
  })

  // Track services with open tabs (these should stay highlighted)
  const [servicesWithTabs, setServicesWithTabs] = useState<Set<string>>(new Set())

  // Handle path selection
  const handlePathSelect = useCallback(
    (pathIds: string[]) => {
      setState((prev) => {
        // Update highlighted services based on selected paths
        const highlightedServices = new Set<string>()
        const newTabs = [...prev.activeTabs.filter((t) => t.type === 'global')] // Keep global tab
        const newServicesWithTabs = new Set<string>()

        // For each selected path, add its services and create tabs
        pathIds.forEach((pathId) => {
          const path = prev.availablePaths.find((p) => p.id === pathId)
          if (path) {
            path.services.forEach((serviceId) => {
              highlightedServices.add(serviceId)
              newServicesWithTabs.add(serviceId)

              // Check if tab already exists
              const existingTab = prev.activeTabs.find(
                (tab) => tab.type === 'service' && tab.targetId === serviceId
              )

              if (!existingTab) {
                // Create new tab for this service
                const service = generateMockServices().find((s) => s.id === serviceId)
                const newTab: AnalysisTab = {
                  id: `service-${serviceId}-${Date.now()}`,
                  type: 'service',
                  title: service?.name || serviceId,
                  targetId: serviceId,
                  content: {
                    summary: `Service ${service?.name || serviceId} analysis`,
                    insights: [],
                    metrics: service?.metrics
                      ? {
                          requestRate: service.metrics.rate,
                          errorRate: service.metrics.errorRate,
                          latency: {
                            p50: service.metrics.duration * 0.7,
                            p95: service.metrics.duration * 1.5,
                            p99: service.metrics.duration * 2
                          },
                          saturation: Math.floor(Math.random() * 100)
                        }
                      : undefined
                  }
                }
                newTabs.push(newTab)
              } else {
                newTabs.push(existingTab)
              }
            })
          }
        })

        // Update servicesWithTabs
        setServicesWithTabs(newServicesWithTabs)

        return {
          ...prev,
          selectedPaths: pathIds,
          highlightedServices,
          activeTabs: newTabs,
          activeTabId: newTabs.length > 1 ? newTabs[1].id : 'global' // Switch to first service tab if available
        }
      })

      // Call props callback if provided
      if (propsOnPathSelect) {
        propsOnPathSelect(pathIds)
      }

      // Show feedback
      if (pathIds.length === 0) {
        message.info('Showing all services')
      } else if (pathIds.length === 1) {
        const path = state.availablePaths.find((p) => p.id === pathIds[0])
        message.success(`Opened tabs for all services in: ${path?.name}`)
      } else {
        message.success(`Comparing ${pathIds.length} paths`)
      }
    },
    [state.availablePaths, propsOnPathSelect]
  )

  // Handle show all paths
  const handleShowAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedPaths: [],
      highlightedServices: new Set(),
      activeTabs: prev.activeTabs.filter((t) => t.type === 'global'), // Keep only global tab
      activeTabId: 'global'
    }))
    setServicesWithTabs(new Set())
    message.info('Showing complete topology')
  }, [])

  // Handle service click - create or switch to tab
  const handleServiceClick = useCallback(
    (serviceId: string) => {
      console.log('CriticalRequestPathsTopology - handleServiceClick called with:', serviceId)

      setState((prev) => {
        console.log('Current tabs:', prev.activeTabs)

        // Check if tab already exists
        const existingTab = prev.activeTabs.find(
          (tab) => tab.type === 'service' && tab.targetId === serviceId
        )

        if (existingTab) {
          console.log('Found existing tab:', existingTab)
          // If clicking on the currently active service tab, close it and unhighlight
          if (prev.activeTabId === existingTab.id) {
            // Remove the tab and unhighlight the service
            const newTabs = prev.activeTabs.filter((t) => t.id !== existingTab.id)
            const newHighlighted = new Set(prev.highlightedServices)
            newHighlighted.delete(serviceId)

            setServicesWithTabs((prev) => {
              const newSet = new Set(prev)
              newSet.delete(serviceId)
              return newSet
            })

            return {
              ...prev,
              activeTabs: newTabs,
              activeTabId: 'global',
              highlightedServices: newHighlighted
            }
          }
          // Otherwise switch to the existing service tab
          return {
            ...prev,
            activeTabId: existingTab.id
          }
        }

        // Create new tab (max 5 service tabs)
        const serviceTabs = prev.activeTabs.filter((t) => t.type === 'service')
        if (serviceTabs.length >= 5) {
          message.warning('Maximum 5 service tabs allowed. Please close a tab first.')
          return prev
        }

        // Get service data for the new tab
        const service = generateMockServices().find((s) => s.id === serviceId)

        const newTab: AnalysisTab = {
          id: `service-${serviceId}-${Date.now()}`,
          type: 'service',
          title: service?.name || serviceId,
          targetId: serviceId,
          content: {
            summary: `Service ${service?.name || serviceId} analysis`,
            insights: [],
            metrics: service?.metrics
              ? {
                  requestRate: service.metrics.rate,
                  errorRate: service.metrics.errorRate,
                  latency: {
                    p50: service.metrics.duration * 0.7,
                    p95: service.metrics.duration * 1.5,
                    p99: service.metrics.duration * 2
                  },
                  saturation: Math.floor(Math.random() * 100)
                }
              : undefined
          }
        }

        console.log('Creating new tab:', newTab)

        // Add to highlighted services
        const newHighlighted = new Set(prev.highlightedServices)
        newHighlighted.add(serviceId)

        // Track that this service has a tab
        setServicesWithTabs((prev) => {
          const newSet = new Set(prev)
          newSet.add(serviceId)
          return newSet
        })

        return {
          ...prev,
          activeTabs: [...prev.activeTabs, newTab],
          activeTabId: newTab.id,
          highlightedServices: newHighlighted
        }
      })

      // Call props callback if provided
      if (propsOnServiceClick) {
        propsOnServiceClick(serviceId)
      }
    },
    [propsOnServiceClick]
  )

  // Handle tab change
  const handleTabChange = useCallback((tabId: string) => {
    setState((prev) => ({
      ...prev,
      activeTabId: tabId
    }))
  }, [])

  // Handle tab close
  const handleTabClose = useCallback((tabId: string) => {
    setState((prev) => {
      const closedTab = prev.activeTabs.find((t) => t.id === tabId)
      const newTabs = prev.activeTabs.filter((t) => t.id !== tabId)

      // If closing a service tab, unhighlight that service
      if (closedTab && closedTab.type === 'service' && closedTab.targetId) {
        const newHighlighted = new Set(prev.highlightedServices)
        newHighlighted.delete(closedTab.targetId)

        // Remove from servicesWithTabs
        setServicesWithTabs((prev) => {
          const newSet = new Set(prev)
          if (closedTab.targetId) {
            newSet.delete(closedTab.targetId)
          }
          return newSet
        })

        // If closing the active tab, switch to another tab
        let newActiveId = prev.activeTabId
        if (prev.activeTabId === tabId) {
          // Try to find another service tab first
          const remainingServiceTab = newTabs.find((t) => t.type === 'service')
          if (remainingServiceTab) {
            newActiveId = remainingServiceTab.id
          } else {
            // Otherwise go back to global
            newActiveId = 'global'
          }
        }

        return {
          ...prev,
          activeTabs: newTabs,
          activeTabId: newActiveId,
          highlightedServices: newHighlighted
        }
      }

      // If closing the active tab, switch to another tab
      let newActiveId = prev.activeTabId
      if (prev.activeTabId === tabId) {
        // Try to find another service tab first
        const remainingServiceTab = newTabs.find((t) => t.type === 'service')
        if (remainingServiceTab) {
          newActiveId = remainingServiceTab.id
        } else {
          // Otherwise go back to global
          newActiveId = 'global'
        }
      }

      return {
        ...prev,
        activeTabs: newTabs,
        activeTabId: newActiveId
      }
    })
  }, [])

  // Calculate responsive column spans
  const getColSpans = () => {
    if (state.isPanelCollapsed.paths && state.isPanelCollapsed.analysis) {
      return { paths: 0, topology: 24, analysis: 0 }
    }
    if (state.isPanelCollapsed.paths) {
      return { paths: 0, topology: 17, analysis: 7 }
    }
    if (state.isPanelCollapsed.analysis) {
      return { paths: 4, topology: 20, analysis: 0 }
    }

    // Default proportions: 15% | 55% | 30%
    return {
      paths: 4, // ~16.7% (4/24)
      topology: 13, // ~54.2% (13/24)
      analysis: 7 // ~29.1% (7/24)
    }
  }

  const colSpans = getColSpans()

  return (
    <div
      className={`critical-request-paths-topology ${className}`}
      data-testid="service-topology-container"
    >
      <Row gutter={[12, 12]} style={{ height: '100%' }}>
        {/* Critical Paths Panel */}
        {colSpans.paths > 0 && (
          <Col span={colSpans.paths} style={{ height: '100%' }} data-testid="critical-paths-column">
            <CriticalPathsPanel
              paths={state.availablePaths}
              selectedPaths={state.selectedPaths}
              onPathSelect={handlePathSelect}
              onShowAll={handleShowAll}
            />
          </Col>
        )}

        {/* Topology Graph or Path Flow Chart */}
        <Col
          span={colSpans.topology}
          style={{ height: '100%' }}
          data-testid="topology-graph-column"
        >
          {state.selectedPaths.length === 1 ? (
            <PathFlowChartPanel
              path={state.availablePaths.find((p) => p.id === state.selectedPaths[0]) || null}
              services={generateMockServices()}
              height={window.innerHeight - 120}
            />
          ) : (
            <ServiceTopologyPanel
              timeRange={getTimeRange()}
              highlightedServices={Array.from(state.highlightedServices)}
              servicesWithTabs={Array.from(servicesWithTabs)} // Pass services that have tabs open
              onServiceClick={handleServiceClick}
              selectedPaths={
                state.selectedPaths
                  .map((id) => state.availablePaths.find((p) => p.id === id))
                  .filter(Boolean) as CriticalPath[]
              }
            />
          )}
        </Col>

        {/* AI Analysis Panel */}
        {colSpans.analysis > 0 && (
          <Col span={colSpans.analysis} style={{ height: '100%' }} data-testid="ai-analysis-column">
            <AIAnalysisPanel
              tabs={state.activeTabs}
              activeTabId={state.activeTabId}
              onTabChange={handleTabChange}
              onTabClose={handleTabClose}
              selectedModel="claude"
            />
          </Col>
        )}
      </Row>
    </div>
  )
}

export default ServiceTopology
