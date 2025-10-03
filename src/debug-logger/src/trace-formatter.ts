/**
 * ASCII Trace Formatter
 * Renders trace hierarchies as tree structures with timing information
 */

import type { SpanData, SpanTreeNode, FormatOptions, TraceFormatter } from './types.js'

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
}

// Box drawing characters for tree structure
const boxChars = {
  branch: '├─',
  last: '└─',
  vertical: '│',
  space: '  '
}

/**
 * Build a hierarchical tree from flat span array
 */
const buildSpanTree = (spans: SpanData[]): SpanTreeNode[] => {
  // Create a map of span ID to span
  const spanMap = new Map<string, SpanData>()
  const childrenMap = new Map<string, SpanData[]>()
  const rootSpans: SpanData[] = []
  const orphanedSpans: SpanData[] = []

  // First pass: build maps
  for (const span of spans) {
    spanMap.set(span.spanId, span)

    if (!span.parentSpanId) {
      rootSpans.push(span)
    } else {
      const siblings = childrenMap.get(span.parentSpanId) || []
      siblings.push(span)
      childrenMap.set(span.parentSpanId, siblings)
    }
  }

  // Second pass: identify orphaned spans (parent doesn't exist)
  for (const span of spans) {
    if (span.parentSpanId && !spanMap.has(span.parentSpanId)) {
      console.log(
        `[TraceFormatter] Orphaned span detected: ${span.spanId.substring(0, 8)} parent:${span.parentSpanId.substring(0, 8)} ${span.serviceName}:${span.operationName}`
      )
      orphanedSpans.push(span)
    }
  }

  console.log(
    `[TraceFormatter] Total: ${spans.length} spans, Roots: ${rootSpans.length}, Orphaned: ${orphanedSpans.length}`
  )

  // Sort children by start time
  for (const children of childrenMap.values()) {
    children.sort((a, b) => {
      const aStart = BigInt(a.startTimeUnixNano)
      const bStart = BigInt(b.startTimeUnixNano)
      return aStart < bStart ? -1 : aStart > bStart ? 1 : 0
    })
  }

  // Recursive function to build tree
  const buildNode = (span: SpanData, depth: number): SpanTreeNode => {
    const children = childrenMap.get(span.spanId) || []
    return {
      span,
      children: children.map((child) => buildNode(child, depth + 1)),
      depth
    }
  }

  // Build tree from roots
  const tree = rootSpans.map((span) => buildNode(span, 0))

  // Add orphaned spans as separate root trees
  for (const orphan of orphanedSpans) {
    tree.push(buildNode(orphan, 0))
  }

  return tree
}

/**
 * Convert nanoseconds to milliseconds
 */
const nsToMs = (ns: number | bigint): number => {
  return Number(ns) / 1_000_000
}

/**
 * Create a timeline bar visualization for a span
 */
const createTimelineBar = (
  span: SpanData,
  traceStartNs: bigint,
  traceDurationNs: bigint,
  barWidth: number = 50
): string => {
  // Handle zero-duration traces
  if (traceDurationNs === BigInt(0)) {
    return '█'.padEnd(barWidth, ' ')
  }

  const startNs = BigInt(span.startTimeUnixNano)
  const durationNs = BigInt(span.durationNs)

  // Calculate position and width as percentages
  const startOffset = Number(((startNs - traceStartNs) * BigInt(1000)) / traceDurationNs) / 1000
  const durationPercent = Number((durationNs * BigInt(1000)) / traceDurationNs) / 1000

  // Convert to character positions
  const startPos = Math.floor(startOffset * barWidth)
  const barLength = Math.max(1, Math.floor(durationPercent * barWidth))

  // Build the bar
  const bar = [' '.repeat(startPos), '█'.repeat(barLength)].join('')

  return bar.padEnd(barWidth, ' ')
}

/**
 * Format a single span node with line numbering
 */
const formatSpanNode = (
  node: SpanTreeNode,
  prefix: string,
  isLast: boolean,
  traceStartNs: bigint,
  traceDurationNs: bigint,
  options: FormatOptions,
  currentDepth: number,
  lineNumber: { value: number }
): string[] => {
  // Check depth limit
  if (currentDepth >= options.maxDepth) {
    const connector = isLast ? boxChars.last : boxChars.branch
    const line = `${lineNumber.value}. ${prefix}${connector} ... (max depth reached)`
    lineNumber.value++
    return [options.colorOutput ? `${colors.gray}${line}${colors.reset}` : line]
  }

  const lines: string[] = []
  const { span } = node

  // Build the line for this span
  const connector = isLast ? boxChars.last : boxChars.branch
  const spanName = `${span.serviceName}:${span.operationName}`

  const startNs = BigInt(span.startTimeUnixNano)
  const relativeStartMs = nsToMs(startNs - traceStartNs)
  const durationMs = nsToMs(span.durationNs)

  // Build line with number prefix
  let line = `${lineNumber.value}. `

  // Add tree structure if not at root
  if (currentDepth > 0) {
    line += `${prefix}${connector} `
  }

  line += spanName

  // Add timing if enabled
  if (options.showTimings) {
    line += `\n   ${relativeStartMs.toFixed(2)}ms `
  }

  // Add timeline bar
  const timelineBar = createTimelineBar(span, traceStartNs, traceDurationNs)
  line += timelineBar

  // Add duration and depth info
  line += ` ${durationMs.toFixed(2)}ms [depth=${currentDepth}]`

  // Add status color
  if (options.colorOutput) {
    const statusColor =
      span.statusCode === 'STATUS_CODE_ERROR'
        ? colors.red
        : span.statusCode === 'STATUS_CODE_OK'
          ? colors.green
          : colors.cyan

    line = `${statusColor}${line}${colors.reset}`
  }

  lines.push(line)
  lineNumber.value++

  // Add attributes if enabled
  if (options.showAttributes && span.attributes) {
    const attrKeys = Object.keys(span.attributes)
    if (attrKeys.length > 0) {
      const attrPrefix =
        '   ' + prefix + (isLast ? boxChars.space : boxChars.vertical) + boxChars.space
      for (const key of attrKeys.slice(0, 5)) {
        // Limit to 5 attributes
        const value = span.attributes[key]
        const attrLine = `${attrPrefix}${key}: ${JSON.stringify(value)}`
        lines.push(options.colorOutput ? `${colors.gray}${attrLine}${colors.reset}` : attrLine)
      }
      if (attrKeys.length > 5) {
        const moreLine = `${attrPrefix}... (${attrKeys.length - 5} more)`
        lines.push(options.colorOutput ? `${colors.gray}${moreLine}${colors.reset}` : moreLine)
      }
    }
  }

  // Recursively format children
  const childPrefix = prefix + (isLast ? boxChars.space : boxChars.vertical + ' ')
  node.children.forEach((child, index) => {
    const isLastChild = index === node.children.length - 1
    const childLines = formatSpanNode(
      child,
      childPrefix,
      isLastChild,
      traceStartNs,
      traceDurationNs,
      options,
      currentDepth + 1,
      lineNumber
    )
    lines.push(...childLines)
  })

  return lines
}

/**
 * Format an entire trace as ASCII tree
 */
export const formatTrace = (traceId: string, spans: SpanData[], options: FormatOptions): string => {
  if (spans.length === 0) {
    return `[TRACE] ${traceId} - No spans found`
  }

  // Build hierarchical tree
  const tree = buildSpanTree(spans)

  // Debug: Count total nodes in tree
  const countNodes = (nodes: SpanTreeNode[]): number => {
    let total = nodes.length
    for (const node of nodes) {
      total += countNodes(node.children)
    }
    return total
  }
  const totalNodes = countNodes(tree)
  console.log(
    `[TraceFormatter] Tree has ${tree.length} roots, ${totalNodes} total nodes from ${spans.length} spans`
  )

  // Find trace start time (earliest span)
  const firstSpan = spans[0]
  if (!firstSpan) {
    return '[TRACE] No spans found'
  }

  const traceStartNs = spans.reduce((min, span) => {
    const startNs = BigInt(span.startTimeUnixNano)
    return startNs < min ? startNs : min
  }, BigInt(firstSpan.startTimeUnixNano))

  // Find trace end time (latest span)
  const traceEndNs = spans.reduce((max, span) => {
    const endNs = BigInt(span.endTimeUnixNano)
    return endNs > max ? endNs : max
  }, BigInt(firstSpan.endTimeUnixNano))

  // Calculate total duration
  const totalDurationNs = traceEndNs - traceStartNs
  const totalDurationMs = nsToMs(totalDurationNs)

  // Build output
  const lines: string[] = []

  // Header
  const header = `[TRACE] Trace ${traceId.substring(0, 16)}... (${totalDurationMs.toFixed(0)}ms total, ${spans.length} spans)`
  lines.push(options.colorOutput ? `${colors.cyan}${header}${colors.reset}` : header)

  // Format each root node with line numbering
  const lineNumber = { value: 0 }
  tree.forEach((node, index) => {
    const isLast = index === tree.length - 1
    const nodeLines = formatSpanNode(
      node,
      '',
      isLast,
      traceStartNs,
      totalDurationNs,
      options,
      0,
      lineNumber
    )
    lines.push(...nodeLines)
  })

  // Summary
  const services = new Set(spans.map((s) => s.serviceName))
  const summary = `Services: ${Array.from(services).join(', ')}`
  lines.push(options.colorOutput ? `${colors.gray}${summary}${colors.reset}` : summary)

  return lines.join('\n')
}

/**
 * Create trace formatter instance
 */
export const createTraceFormatter = (): TraceFormatter => ({
  formatTrace
})
