// Types for Trace View components

export interface SpanEvent {
  timeUnixNano: string
  name: string
  attributes?: Record<string, unknown>
  droppedAttributesCount?: number
}

export interface SpanLink {
  traceId: string
  spanId: string
  traceState?: string
  attributes?: Record<string, unknown>
  droppedAttributesCount?: number
}

export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string | null
  serviceName: string
  operationName: string
  startTimeUnixNano: string
  endTimeUnixNano: string
  durationNs: number
  statusCode: 'STATUS_CODE_UNSET' | 'STATUS_CODE_OK' | 'STATUS_CODE_ERROR'
  statusMessage?: string
  spanKind:
    | 'SPAN_KIND_UNSPECIFIED'
    | 'SPAN_KIND_INTERNAL'
    | 'SPAN_KIND_SERVER'
    | 'SPAN_KIND_CLIENT'
    | 'SPAN_KIND_PRODUCER'
    | 'SPAN_KIND_CONSUMER'
  attributes?: Record<string, unknown>
  events?: SpanEvent[]
  links?: SpanLink[]
  resourceAttributes?: Record<string, unknown>
  depth?: number // Calculated field for tree depth
  children?: SpanData[] // Calculated field for tree structure
}

export interface TraceData {
  spans: SpanData[]
  metadata: {
    traceId: string
    totalSpans: number
    rootSpanId: string
    services: string[]
    durationMs: number
    startTime: number
    endTime: number
  }
}

export interface SpanTreeNode extends SpanData {
  depth: number
  children: SpanTreeNode[]
  collapsed?: boolean
  x?: number // For visualization positioning
  y?: number // For visualization positioning
  width?: number // For bar width
}

export interface TraceViewConfig {
  showMinimap: boolean
  showCriticalPath: boolean
  showErrors: boolean
  expandAll: boolean
  timeFormat: 'relative' | 'absolute'
  colorScheme: 'default' | 'service' | 'duration' | 'status'
}

export interface ViewportConfig {
  startTime: number
  endTime: number
  zoom: number
  panX: number
}

export interface CriticalPath {
  spanIds: Set<string>
  totalDuration: number
  segments: Array<{
    spanId: string
    startTime: number
    endTime: number
    duration: number
  }>
}

export interface SpanTreeState {
  collapsedSpans: Set<string>
  searchQuery: string
  matchingSpans: string[]
  currentMatchIndex: number
}

export interface SpanSearchResult {
  spanId: string
  matchType: 'service' | 'operation' | 'attribute' | 'spanId'
  matchedText: string
}
