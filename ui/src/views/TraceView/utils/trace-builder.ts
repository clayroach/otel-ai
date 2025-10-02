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
  const orphanedSpans: SpanTreeNode[] = []
  const processedSpans = new Set<string>()

  // Second pass: Build parent-child relationships
  spans.forEach((span) => {
    const node = spanMap.get(span.spanId)
    if (!node) return // Skip if node wasn't created (shouldn't happen)

    if (!span.parentSpanId) {
      // This is a true root span (no parent ID at all)
      roots.push(node)
      processedSpans.add(span.spanId)
    } else if (!spanMap.has(span.parentSpanId)) {
      // This is an orphaned span (parent exists but not in this trace)
      // We'll try to find a temporal parent later
      orphanedSpans.push(node)
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

  // Try to find temporal parents for orphaned spans
  orphanedSpans.forEach((orphan) => {
    const orphanStart = BigInt(orphan.startTimeUnixNano)
    const orphanEnd = BigInt(orphan.endTimeUnixNano)

    // Find the best temporal parent (a span that contains this orphan's time range)
    const findBestParent = (nodes: SpanTreeNode[]): SpanTreeNode | null => {
      let bestParent: SpanTreeNode | null = null
      let smallestDuration = BigInt(Number.MAX_SAFE_INTEGER) * BigInt(1_000_000)

      const checkNode = (node: SpanTreeNode): void => {
        const nodeStart = BigInt(node.startTimeUnixNano)
        const nodeEnd = BigInt(node.endTimeUnixNano)
        const nodeDuration = nodeEnd - nodeStart

        // Check if this node temporally contains the orphan
        if (nodeStart <= orphanStart && nodeEnd >= orphanEnd && node.spanId !== orphan.spanId) {
          // This span contains the orphan's time range
          if (nodeDuration < smallestDuration) {
            bestParent = node
            smallestDuration = nodeDuration
          }
        }

        // Recursively check children
        node.children.forEach(checkNode)
      }

      nodes.forEach(checkNode)
      return bestParent
    }

    const bestParent = findBestParent(roots)
    if (bestParent) {
      // Found a temporal parent - add as child
      bestParent.children.push(orphan)
    } else {
      // No temporal parent found - add as root
      roots.push(orphan)
    }
  })

  // Handle any remaining unprocessed spans (shouldn't happen with the new logic)
  spans.forEach((span) => {
    if (!processedSpans.has(span.spanId)) {
      const node = spanMap.get(span.spanId)
      if (node) {
        roots.push(node)
      }
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
