import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { TraceData, SpanData } from '../types'

interface ApiResponse {
  spans: Array<{
    traceId: string
    spanId: string
    parentSpanId?: string | null
    serviceName: string
    operationName: string
    startTimeUnixNano: string
    endTimeUnixNano: string
    durationNs: number | string
    statusCode: string
    statusMessage?: string
    spanKind: string
    attributes?: Record<string, unknown>
    resourceAttributes?: Record<string, unknown>
  }>
  metadata: {
    traceId: string
    totalSpans: number
    rootSpanId: string
    services: string[]
    durationMs: number
    startTime: number
    endTime: number
  }
  debugTrace?: string
}

const fetchTraceData = async (traceId: string): Promise<TraceData> => {
  const response = await axios.get<ApiResponse>('/api/traces', {
    params: { traceId }
  })

  const { spans, metadata, debugTrace } = response.data

  // Log debug trace to browser console if available
  if (debugTrace) {
    console.log(debugTrace)
  }

  // Convert API response to our internal format
  const formattedSpans: SpanData[] = spans.map((span) => ({
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId || undefined,
    serviceName: span.serviceName,
    operationName: span.operationName,
    startTimeUnixNano: span.startTimeUnixNano,
    endTimeUnixNano: span.endTimeUnixNano,
    durationNs: typeof span.durationNs === 'string' ? parseInt(span.durationNs) : span.durationNs,
    statusCode: span.statusCode as SpanData['statusCode'],
    statusMessage: span.statusMessage,
    spanKind: span.spanKind as SpanData['spanKind'],
    attributes: span.attributes,
    resourceAttributes: span.resourceAttributes
  }))

  return {
    spans: formattedSpans,
    metadata
  }
}

export const useTraceData = (traceId: string) => {
  return useQuery<TraceData, Error>({
    queryKey: ['trace', traceId],
    queryFn: () => fetchTraceData(traceId),
    enabled: !!traceId,
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 0, // Always consider data stale - fetch every time
    gcTime: 0, // Don't cache at all - for debugging
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: false
  })
}
