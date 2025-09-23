# UI Package - Claude Context

## Package Overview
React-based frontend application with TypeScript, Vite, Apache ECharts, and TanStack Query. Provides observability dashboards, real-time monitoring, and AI-powered insights visualization.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All components use TypeScript with strict mode
- Tests go in test/unit/ and test/e2e/ subdirectories
- Never use scattered *.test.tsx files in src/
- Use TanStack Query for all API calls
- Use Zustand for global state management
- Components must be accessible (WCAG 2.1 AA)
- Use CSS modules or styled-components (no inline styles)

## Core Primitives & Patterns

### Component Structure Pattern
```typescript
// Standard component structure
interface ComponentProps {
  data: SomeData
  onAction?: (event: ActionEvent) => void
  className?: string
}

export const Component: React.FC<ComponentProps> = ({
  data,
  onAction,
  className
}) => {
  // Hooks at the top
  const { theme } = useTheme()
  const queryClient = useQueryClient()

  // Queries and mutations
  const { data: apiData, isLoading } = useQuery({
    queryKey: ['key', param],
    queryFn: () => fetchData(param)
  })

  // Event handlers
  const handleClick = useCallback((e: MouseEvent) => {
    onAction?.({ type: 'click', target: e.target })
  }, [onAction])

  // Loading state
  if (isLoading) return <Spinner />

  // Error boundary wrapped
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <div className={cn(styles.container, className)}>
        {/* Component content */}
      </div>
    </ErrorBoundary>
  )
}
```

### TanStack Query Pattern
```typescript
// API hooks with proper typing
export const useTraces = (timeRange: TimeRange) => {
  return useQuery({
    queryKey: ['traces', timeRange],
    queryFn: () => api.getTraces(timeRange),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  })
}

export const useAnalyzeTraces = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (traceIds: string[]) => api.analyzeTraces(traceIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] })
      toast.success('Analysis complete')
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`)
    }
  })
}
```

### ECharts Component Pattern
```typescript
// Reusable chart component
export const TimeSeriesChart: React.FC<ChartProps> = ({ data, height = 400 }) => {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chart, setChart] = useState<echarts.ECharts>()

  useEffect(() => {
    if (!chartRef.current) return

    const instance = echarts.init(chartRef.current)
    setChart(instance)

    return () => {
      instance.dispose()
    }
  }, [])

  useEffect(() => {
    if (!chart) return

    const option: EChartsOption = {
      // Chart configuration
    }

    chart.setOption(option)
  }, [chart, data])

  // Handle resize
  useEffect(() => {
    const handleResize = () => chart?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [chart])

  return <div ref={chartRef} style={{ height }} />
}
```

### State Management Pattern
```typescript
// Zustand store with TypeScript
interface AppState {
  selectedService: string | null
  timeRange: TimeRange
  theme: 'light' | 'dark'
  setSelectedService: (service: string | null) => void
  setTimeRange: (range: TimeRange) => void
  toggleTheme: () => void
}

export const useAppStore = create<AppState>()((set) => ({
  selectedService: null,
  timeRange: { start: Date.now() - 3600000, end: Date.now() },
  theme: 'light',
  setSelectedService: (service) => set({ selectedService: service }),
  setTimeRange: (range) => set({ timeRange: range }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' }))
}))
```

## API Contracts

### Frontend Service Interface
```typescript
// API client with type safety
export interface APIClient {
  // Traces
  getTraces: (params: QueryParams) => Promise<Trace[]>
  getTraceById: (id: string) => Promise<Trace>

  // Topology
  getServiceTopology: (timeRange: TimeRange) => Promise<ServiceTopology>
  getServiceDependencies: (service: string) => Promise<ServiceDependency[]>

  // Anomalies
  getAnomalies: (service?: string) => Promise<Anomaly[]>
  analyzeTraces: (traceIds: string[]) => Promise<AnalysisResult>

  // Dashboards
  generateDashboard: (spec: DashboardSpec) => Promise<Dashboard>
  saveDashboard: (dashboard: Dashboard) => Promise<void>

  // WebSocket
  subscribeToAnomalies: (callback: (anomaly: Anomaly) => void) => () => void
}

// Type definitions
export interface Trace {
  traceId: string
  spanId: string
  parentSpanId?: string
  serviceName: string
  operationName: string
  startTime: number
  duration: number
  status: 'ok' | 'error'
  attributes: Record<string, unknown>
}

export interface ServiceTopology {
  nodes: ServiceNode[]
  edges: ServiceEdge[]
  statistics: TopologyStats
}

export interface Anomaly {
  id: string
  service: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: number
  description: string
  recommendation: string
}
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Direct API calls without TanStack Query
- ❌ Storing API data in component state
- ❌ Not handling loading and error states
- ❌ Memory leaks from unsubscribed WebSockets
- ❌ Not disposing ECharts instances
- ❌ Using any type instead of proper TypeScript
- ❌ Missing error boundaries
- ❌ Not memoizing expensive computations

## Testing Requirements
- Unit tests: Component logic with React Testing Library
- Integration tests: API interaction with MSW
- E2E tests: User flows with Playwright
- Accessibility tests: axe-core integration
- Performance tests: React DevTools Profiler
- Test commands: `pnpm test:unit:ui`, `pnpm test:e2e:ui`

## Performance Considerations

### Optimization Strategies
- React.memo for expensive components
- useMemo/useCallback for expensive operations
- Virtual scrolling for large lists
- Code splitting with React.lazy
- Optimistic updates for better UX
- WebSocket connection pooling

### Bundle Optimization
```typescript
// Lazy load heavy components
const ServiceTopology = lazy(() => import('./components/ServiceTopology'))
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'))

// Route-based code splitting
const routes = [
  {
    path: '/topology',
    element: (
      <Suspense fallback={<Loading />}>
        <ServiceTopology />
      </Suspense>
    )
  }
]
```

### Chart Performance
```typescript
// Optimize chart rendering
const chartOptions = {
  animation: false,  // Disable for large datasets
  lazyUpdate: true,  // Batch updates
  progressive: 1000,  // Progressive rendering
  useUTC: true  // Consistent timestamps
}
```

## Dependencies & References
- External:
  - `react` ^18.3.0
  - `typescript` ^5.5.0
  - `vite` ^5.4.0
  - `@tanstack/react-query` ^5.51.0
  - `echarts` ^5.5.0
  - `zustand` ^4.5.0
  - `react-router-dom` ^6.26.0
- Internal:
  - API client to server package
- Documentation:
  - React Docs: https://react.dev
  - TanStack Query: https://tanstack.com/query
  - ECharts Examples: https://echarts.apache.org/examples

## Quick Start Commands
```bash
# Development
pnpm dev:ui

# Testing
pnpm test:unit:ui
pnpm test:e2e:ui

# Build
pnpm build:ui

# Preview production build
pnpm preview:ui

# Find active work
mcp__github__search_issues query:"package:ui is:open"
```