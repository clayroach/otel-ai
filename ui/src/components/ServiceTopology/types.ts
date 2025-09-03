// Types for Critical Request Paths Topology Feature

export interface CriticalPath {
  id: string
  name: string
  description?: string
  services: string[]
  edges: Array<{
    source: string
    target: string
  }>
  metrics: {
    requestCount: number
    avgLatency: number
    errorRate: number
    p99Latency: number
  }
  priority: 'critical' | 'high' | 'medium' | 'low'
  lastUpdated: Date
}

export interface ServiceMetrics {
  requestRate: number
  errorRate: number
  latency: {
    p50: number
    p95: number
    p99: number
  }
  saturation: number
}

export interface AnalysisTab {
  id: string
  type: 'global' | 'service'
  title: string
  targetId?: string // service ID if type === 'service'
  content?: {
    summary: string
    insights: Array<{
      id: string
      type: 'performance' | 'error' | 'architecture' | 'recommendation'
      title: string
      description: string
      severity: 'critical' | 'warning' | 'info'
    }>
    metrics?: ServiceMetrics
  }
}

export interface TopologyState {
  // Path selection
  availablePaths: CriticalPath[]
  selectedPaths: string[]
  pathFilter: 'all' | 'critical' | 'errors' | 'slow'

  // Graph state
  highlightedServices: Set<string>
  animationEnabled: boolean

  // Analysis state
  activeTabs: AnalysisTab[]
  activeTabId: string

  // UI state
  panelSizes: {
    paths: number
    topology: number
    analysis: number
  }
  isPanelCollapsed: {
    paths: boolean
    analysis: boolean
  }
}

export interface PanelProps {
  width?: number | string
  minWidth?: number
  maxWidth?: number
  collapsible?: boolean
  collapsed?: boolean
  onCollapse?: (collapsed: boolean) => void
}

export interface ServiceTopologyProps {
  // Data props
  paths?: CriticalPath[]
  onPathSelect?: (pathIds: string[]) => void
  onServiceClick?: (serviceId: string) => void

  // UI props
  defaultPanelSizes?: {
    paths?: number
    topology?: number
    analysis?: number
  }
  resizable?: boolean
  className?: string
}
