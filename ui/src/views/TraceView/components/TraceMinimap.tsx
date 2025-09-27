import React from 'react'
import { Card } from 'antd'
import { SpanTreeNode, ViewportConfig } from '../types'

interface TraceMinimapProps {
  spans: SpanTreeNode[]
  viewport: ViewportConfig
  onViewportChange: (viewport: ViewportConfig) => void
  height: number
}

export const TraceMinimap: React.FC<TraceMinimapProps> = ({
  // spans,  // TODO: Use for minimap visualization
  // viewport,  // TODO: Use for viewport indicator
  // onViewportChange,  // TODO: Use for click navigation
  height
}) => {
  // TODO: Implement minimap visualization
  return (
    <Card
      size="small"
      style={{ height, marginBottom: 8 }}
      bodyStyle={{ height: '100%', padding: 8 }}
    >
      <div
        style={{
          height: '100%',
          background: '#f5f5f5',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999'
        }}
      >
        Trace Minimap (Coming Soon)
      </div>
    </Card>
  )
}
