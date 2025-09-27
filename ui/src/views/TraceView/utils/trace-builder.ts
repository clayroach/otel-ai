import { SpanData, SpanTreeNode } from '../types'

/**
 * Build a hierarchical tree structure from flat span data
 */
export function buildSpanTree(spans: SpanData[]): SpanTreeNode[] {
  if (!spans || spans.length === 0) {
    return []
  }

  // Create a map for quick lookup
  const spanMap = new Map<string, SpanTreeNode>()

  // First pass: Create tree nodes for all spans
  spans.forEach((span) => {
    spanMap.set(span.spanId, {
      ...span,
      depth: 0,
      children: []
    })
  })

  // Find root spans (no parent or parent not in map)
  const roots: SpanTreeNode[] = []
  const processedSpans = new Set<string>()

  // Second pass: Build parent-child relationships
  spans.forEach((span) => {
    const node = spanMap.get(span.spanId)!

    if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
      // This is a root span
      roots.push(node)
      processedSpans.add(span.spanId)
    } else {
      // Add as child to parent
      const parent = spanMap.get(span.parentSpanId)
      if (parent) {
        parent.children.push(node)
        processedSpans.add(span.spanId)
      }
    }
  })

  // Handle orphaned spans (parent doesn't exist in this trace)
  spans.forEach((span) => {
    if (!processedSpans.has(span.spanId)) {
      const node = spanMap.get(span.spanId)!
      roots.push(node)
    }
  })

  // Calculate depth for each node
  function setDepth(node: SpanTreeNode, depth: number) {
    node.depth = depth
    node.children.forEach((child) => setDepth(child, depth + 1))
  }

  roots.forEach((root) => setDepth(root, 0))

  // Sort by start time
  function sortByStartTime(nodes: SpanTreeNode[]) {
    nodes.sort((a, b) => {
      const aStart = BigInt(a.startTimeUnixNano)
      const bStart = BigInt(b.startTimeUnixNano)
      if (aStart < bStart) return -1
      if (aStart > bStart) return 1
      return 0
    })
    nodes.forEach((node) => sortByStartTime(node.children))
  }

  sortByStartTime(roots)

  return roots
}

/**
 * Flatten a span tree into a list while preserving hierarchy
 */
export function flattenSpanTree(
  nodes: SpanTreeNode[],
  collapsed: Set<string> = new Set()
): SpanTreeNode[] {
  const result: SpanTreeNode[] = []

  function addNode(node: SpanTreeNode) {
    result.push(node)
    if (!collapsed.has(node.spanId) && node.children.length > 0) {
      node.children.forEach(addNode)
    }
  }

  nodes.forEach(addNode)
  return result
}

/**
 * Calculate the critical path through the trace
 */
export function calculateCriticalPath(root: SpanTreeNode): string[] {
  const criticalPath: string[] = []

  function findLongestPath(node: SpanTreeNode): number {
    criticalPath.push(node.spanId)

    if (node.children.length === 0) {
      return node.durationNs
    }

    // Find child with longest duration
    let maxChild: SpanTreeNode | null = null
    let maxDuration = 0

    node.children.forEach((child) => {
      const childDuration = child.durationNs
      if (childDuration > maxDuration) {
        maxDuration = childDuration
        maxChild = child
      }
    })

    if (maxChild) {
      return findLongestPath(maxChild)
    }

    return node.durationNs
  }

  findLongestPath(root)
  return criticalPath
}

/**
 * Get statistics about the trace
 */
export function getTraceStats(spans: SpanData[]) {
  const serviceCount = new Set(spans.map((s) => s.serviceName)).size
  const errorCount = spans.filter((s) => s.statusCode === 'STATUS_CODE_ERROR').length

  let totalDuration = 0
  if (spans.length > 0) {
    const startTimes = spans.map((s) => BigInt(s.startTimeUnixNano))
    const endTimes = spans.map((s) => BigInt(s.endTimeUnixNano))
    const minStart = startTimes.reduce((a, b) => (a < b ? a : b))
    const maxEnd = endTimes.reduce((a, b) => (a > b ? a : b))
    totalDuration = Number((maxEnd - minStart) / BigInt(1_000_000)) // Convert to milliseconds
  }

  return {
    spanCount: spans.length,
    serviceCount,
    errorCount,
    totalDuration
  }
}
