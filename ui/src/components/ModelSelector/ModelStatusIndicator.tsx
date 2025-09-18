/**
 * ModelStatusIndicator - Visual indicator for model health status
 */

import React from 'react'

interface ModelStatusIndicatorProps {
  status: 'healthy' | 'unhealthy' | 'checking' | 'unknown'
  size?: 'small' | 'medium' | 'large'
  showLabel?: boolean
}

const ModelStatusIndicator: React.FC<ModelStatusIndicatorProps> = ({
  status,
  size = 'medium',
  showLabel = false
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy':
        return '#10b981' // green
      case 'unhealthy':
        return '#ef4444' // red
      case 'checking':
        return '#f59e0b' // amber
      case 'unknown':
      default:
        return '#6b7280' // gray
    }
  }

  const getStatusLabel = () => {
    switch (status) {
      case 'healthy':
        return 'Available'
      case 'unhealthy':
        return 'Unavailable'
      case 'checking':
        return 'Checking...'
      case 'unknown':
      default:
        return 'Unknown'
    }
  }

  const getSizeClass = () => {
    switch (size) {
      case 'small':
        return 'status-indicator-small'
      case 'large':
        return 'status-indicator-large'
      case 'medium':
      default:
        return 'status-indicator-medium'
    }
  }

  return (
    <div className={`model-status-indicator ${getSizeClass()}`}>
      <span
        className="status-dot"
        style={{ backgroundColor: getStatusColor() }}
        title={getStatusLabel()}
      >
        {status === 'checking' && <span className="status-pulse" />}
      </span>
      {showLabel && <span className="status-label">{getStatusLabel()}</span>}
    </div>
  )
}

export default ModelStatusIndicator
