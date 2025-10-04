import React, { useCallback, useEffect, useRef } from 'react'
import { Tag, Space } from 'antd'
import {
  CaretRightOutlined,
  CaretDownOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { SpanTreeNode } from '../types'

interface SpanTreeProps {
  spans: SpanTreeNode[]
  selectedSpan: SpanTreeNode | null
  collapsedSpans: Set<string>
  searchQuery: string
  matchingSpans: string[]
  currentMatchIndex: number
  onSpanClick: (span: SpanTreeNode) => void
  onToggleCollapse: (spanId: string) => void
}

export const SpanTree: React.FC<SpanTreeProps> = ({
  spans,
  selectedSpan,
  collapsedSpans,
  searchQuery,
  matchingSpans,
  currentMatchIndex,
  onSpanClick,
  onToggleCollapse
}) => {
  const treeRef = useRef<HTMLDivElement>(null)
  const currentMatchRef = useRef<HTMLDivElement>(null)

  // Scroll to current match when it changes
  useEffect(() => {
    if (currentMatchRef.current) {
      currentMatchRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [currentMatchIndex])

  const renderTreeNode = useCallback(
    (node: SpanTreeNode) => {
      const isCollapsed = collapsedSpans.has(node.spanId)
      const isSelected = selectedSpan?.spanId === node.spanId
      const hasChildren = node.children.length > 0

      // Check if this span matches search
      const matchIndex = matchingSpans.indexOf(node.spanId)
      const isMatch = matchIndex !== -1
      const isCurrentMatch = matchIndex === currentMatchIndex
      const highlightQuery = searchQuery.toLowerCase()

      // Calculate duration in ms
      const durationMs = node.durationNs / 1_000_000

      // Get status icon and color
      const statusIcon =
        node.statusCode === 'STATUS_CODE_ERROR' ? (
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
        ) : node.statusCode === 'STATUS_CODE_OK' ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <WarningOutlined style={{ color: '#faad14' }} />
        )

      // Highlight matching text
      const highlightText = (text: string) => {
        if (!isMatch || !highlightQuery) return text

        const parts = text.split(new RegExp(`(${highlightQuery})`, 'gi'))
        return parts.map((part, i) =>
          part.toLowerCase() === highlightQuery ? (
            <span key={i} style={{ backgroundColor: '#fff566', fontWeight: 'bold' }}>
              {part}
            </span>
          ) : (
            part
          )
        )
      }

      return (
        <div key={node.spanId}>
          <div
            ref={isCurrentMatch ? currentMatchRef : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              paddingLeft: `${8 + node.depth * 20}px`,
              cursor: 'pointer',
              backgroundColor: isSelected
                ? '#e6f7ff'
                : isCurrentMatch
                  ? '#fffbe6'
                  : isMatch
                    ? '#f6ffed'
                    : 'transparent',
              borderLeft: isSelected ? '3px solid #1890ff' : '3px solid transparent',
              transition: 'background-color 0.2s',
              fontSize: '13px',
              lineHeight: '20px'
            }}
            onClick={() => onSpanClick(node)}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = '#f5f5f5'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected && !isCurrentMatch && !isMatch) {
                e.currentTarget.style.backgroundColor = 'transparent'
              } else if (isCurrentMatch) {
                e.currentTarget.style.backgroundColor = '#fffbe6'
              } else if (isMatch) {
                e.currentTarget.style.backgroundColor = '#f6ffed'
              }
            }}
          >
            {/* Expand/collapse icon */}
            <span
              style={{ width: '16px', display: 'inline-block', flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation()
                if (hasChildren) {
                  onToggleCollapse(node.spanId)
                }
              }}
            >
              {hasChildren ? (
                isCollapsed ? (
                  <CaretRightOutlined style={{ color: '#8c8c8c' }} />
                ) : (
                  <CaretDownOutlined style={{ color: '#8c8c8c' }} />
                )
              ) : null}
            </span>

            {/* Status icon */}
            <span style={{ marginLeft: '4px', marginRight: '8px', flexShrink: 0 }}>
              {statusIcon}
            </span>

            {/* Service and operation name */}
            <Space style={{ flex: 1, minWidth: 0 }} size={4}>
              <Tag
                style={{
                  fontSize: '11px',
                  margin: 0,
                  maxWidth: '120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                color="blue"
              >
                {highlightText(node.serviceName)}
              </Tag>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}
                title={node.operationName}
              >
                {highlightText(node.operationName)}
              </span>
            </Space>

            {/* Duration */}
            <span
              style={{
                marginLeft: '8px',
                color: '#8c8c8c',
                fontSize: '11px',
                flexShrink: 0
              }}
            >
              {durationMs < 1
                ? `${durationMs.toFixed(2)}ms`
                : durationMs < 1000
                  ? `${Math.round(durationMs)}ms`
                  : `${(durationMs / 1000).toFixed(2)}s`}
            </span>
          </div>

          {/* Render children if not collapsed */}
          {!isCollapsed && node.children.length > 0 && (
            <div>{node.children.map((child) => renderTreeNode(child))}</div>
          )}
        </div>
      )
    },
    [
      collapsedSpans,
      selectedSpan,
      searchQuery,
      matchingSpans,
      currentMatchIndex,
      onSpanClick,
      onToggleCollapse
    ]
  )

  return (
    <div
      ref={treeRef}
      style={{
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#fff',
        borderRight: '1px solid #e8e8e8'
      }}
    >
      {spans.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8c' }}>
          No spans to display
        </div>
      ) : (
        <div style={{ paddingBottom: '20px' }}>{spans.map((span) => renderTreeNode(span))}</div>
      )}
    </div>
  )
}
