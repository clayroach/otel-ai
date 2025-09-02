import React, { useState, useCallback } from 'react'
import { Row, Col, message } from 'antd'
import { CriticalPathsPanel } from './CriticalPathsPanel'
import { AIAnalysisPanel } from './AIAnalysisPanel'
import { TopologyTab } from '../TopologyChart'
import type {
  CriticalPath,
  AnalysisTab,
  TopologyState,
  CriticalRequestPathsTopologyProps
} from './types'
import './styles.css'

// Mock data generator for demonstration
const generateMockPaths = (): CriticalPath[] => {
  return [
    {
      id: 'path-1',
      name: 'Checkout Flow',
      description: 'User checkout process from cart to payment confirmation',
      services: ['frontend', 'cartservice', 'checkoutservice', 'paymentservice', 'emailservice'],
      edges: [
        { source: 'frontend', target: 'cartservice' },
        { source: 'frontend', target: 'checkoutservice' },
        { source: 'checkoutservice', target: 'paymentservice' },
        { source: 'checkoutservice', target: 'emailservice' }
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
      services: ['frontend', 'productcatalogservice', 'recommendationservice', 'adservice'],
      edges: [
        { source: 'frontend', target: 'productcatalogservice' },
        { source: 'frontend', target: 'recommendationservice' },
        { source: 'recommendationservice', target: 'productcatalogservice' },
        { source: 'frontend', target: 'adservice' }
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
      name: 'User Authentication',
      description: 'User login and session management',
      services: ['frontend', 'authservice', 'sessionservice', 'userservice'],
      edges: [
        { source: 'frontend', target: 'authservice' },
        { source: 'authservice', target: 'userservice' },
        { source: 'authservice', target: 'sessionservice' }
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
      description: 'Calculate shipping costs and delivery times',
      services: ['frontend', 'shippingservice', 'currencyservice'],
      edges: [
        { source: 'frontend', target: 'shippingservice' },
        { source: 'shippingservice', target: 'currencyservice' }
      ],
      metrics: {
        requestCount: 890,
        avgLatency: 2100,
        errorRate: 0.08,
        p99Latency: 5500
      },
      priority: 'medium',
      lastUpdated: new Date()
    },
    {
      id: 'path-5',
      name: 'Inventory Update',
      description: 'Background inventory synchronization',
      services: ['inventoryservice', 'productcatalogservice', 'notificationservice'],
      edges: [
        { source: 'inventoryservice', target: 'productcatalogservice' },
        { source: 'inventoryservice', target: 'notificationservice' }
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

const generateMockAnalysis = (type: 'global' | 'service', targetId?: string): AnalysisTab['content'] => {
  const insights = type === 'global' ? [
    {
      id: 'insight-1',
      type: 'architecture' as const,
      title: 'Service Coupling Detected',
      description: 'The checkout service has high coupling with 4 downstream services. Consider implementing an event-driven architecture to reduce direct dependencies.',
      severity: 'warning' as const
    },
    {
      id: 'insight-2',
      type: 'performance' as const,
      title: 'Shipping Service Bottleneck',
      description: 'The shipping service shows P99 latency of 5.5s, significantly impacting the checkout flow. Database query optimization recommended.',
      severity: 'critical' as const
    },
    {
      id: 'insight-3',
      type: 'recommendation' as const,
      title: 'Implement Circuit Breaker',
      description: 'Add circuit breaker pattern between frontend and payment service to handle failures gracefully.',
      severity: 'info' as const
    }
  ] : [
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
    summary: type === 'global' 
      ? 'System analysis reveals 3 critical paths with performance bottlenecks. The shipping service is the primary concern with P99 latency exceeding 5 seconds.'
      : `Service ${targetId} handles ${Math.floor(Math.random() * 5000 + 1000)} requests per minute with 99.7% success rate. Performance optimization opportunities identified.`,
    insights,
    metrics: type === 'service' ? {
      requestRate: Math.floor(Math.random() * 100 + 50),
      errorRate: Math.random() * 5,
      latency: {
        p50: Math.floor(Math.random() * 100 + 50),
        p95: Math.floor(Math.random() * 300 + 150),
        p99: Math.floor(Math.random() * 500 + 300)
      },
      saturation: Math.floor(Math.random() * 100)
    } : undefined
  }
}

export const CriticalRequestPathsTopology: React.FC<CriticalRequestPathsTopologyProps> = ({
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
    panelSizes: defaultPanelSizes as any,
    isPanelCollapsed: {
      paths: false,
      analysis: false
    }
  })

  // Handle path selection
  const handlePathSelect = useCallback((pathIds: string[]) => {
    setState(prev => {
      // Update highlighted services based on selected paths
      const highlightedServices = new Set<string>()
      pathIds.forEach(pathId => {
        const path = prev.availablePaths.find(p => p.id === pathId)
        if (path) {
          path.services.forEach(service => highlightedServices.add(service))
        }
      })

      return {
        ...prev,
        selectedPaths: pathIds,
        highlightedServices
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
      const path = state.availablePaths.find(p => p.id === pathIds[0])
      message.success(`Filtered to: ${path?.name}`)
    } else {
      message.success(`Comparing ${pathIds.length} paths`)
    }
  }, [state.availablePaths, propsOnPathSelect])

  // Handle show all paths
  const handleShowAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedPaths: [],
      highlightedServices: new Set()
    }))
    message.info('Showing complete topology')
  }, [])

  // Handle service click - create new tab
  const handleServiceClick = useCallback((serviceId: string) => {
    setState(prev => {
      // Check if tab already exists
      const existingTab = prev.activeTabs.find(
        tab => tab.type === 'service' && tab.targetId === serviceId
      )

      if (existingTab) {
        return {
          ...prev,
          activeTabId: existingTab.id
        }
      }

      // Create new tab (max 5 service tabs)
      const serviceTabs = prev.activeTabs.filter(t => t.type === 'service')
      if (serviceTabs.length >= 5) {
        message.warning('Maximum 5 service tabs allowed. Please close a tab first.')
        return prev
      }

      const newTab: AnalysisTab = {
        id: `service-${serviceId}-${Date.now()}`,
        type: 'service',
        title: serviceId,
        targetId: serviceId,
        content: generateMockAnalysis('service', serviceId)
      }

      return {
        ...prev,
        activeTabs: [...prev.activeTabs, newTab],
        activeTabId: newTab.id
      }
    })

    // Call props callback if provided
    if (propsOnServiceClick) {
      propsOnServiceClick(serviceId)
    }
  }, [propsOnServiceClick])

  // Handle tab change
  const handleTabChange = useCallback((tabId: string) => {
    setState(prev => ({
      ...prev,
      activeTabId: tabId
    }))
  }, [])

  // Handle tab close
  const handleTabClose = useCallback((tabId: string) => {
    setState(prev => {
      const newTabs = prev.activeTabs.filter(t => t.id !== tabId)
      const newActiveId = prev.activeTabId === tabId 
        ? (newTabs[newTabs.length - 1]?.id || 'global')
        : prev.activeTabId

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
      paths: 4,    // ~16.7% (4/24)
      topology: 13, // ~54.2% (13/24)
      analysis: 7   // ~29.1% (7/24)
    }
  }

  const colSpans = getColSpans()

  return (
    <div className={`critical-request-paths-topology ${className}`}>
      <Row gutter={[12, 12]} style={{ height: '100%' }}>
        {/* Critical Paths Panel */}
        {colSpans.paths > 0 && (
          <Col span={colSpans.paths} style={{ height: '100%' }}>
            <CriticalPathsPanel
              paths={state.availablePaths}
              selectedPaths={state.selectedPaths}
              onPathSelect={handlePathSelect}
              onShowAll={handleShowAll}
            />
          </Col>
        )}

        {/* Topology Graph */}
        <Col span={colSpans.topology} style={{ height: '100%' }}>
          <TopologyTab
            data={null} // Will use mock data from TopologyTab
            highlightedServices={Array.from(state.highlightedServices)}
            onServiceClick={handleServiceClick}
            selectedPaths={state.selectedPaths.map(id => 
              state.availablePaths.find(p => p.id === id)
            ).filter(Boolean) as CriticalPath[]}
          />
        </Col>

        {/* AI Analysis Panel */}
        {colSpans.analysis > 0 && (
          <Col span={colSpans.analysis} style={{ height: '100%' }}>
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

export default CriticalRequestPathsTopology