import React from 'react'
import { Space, Button, Switch, Tooltip } from 'antd'
import {
  ReloadOutlined,
  ExpandOutlined,
  CompressOutlined,
  BgColorsOutlined,
  BugOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { TraceViewConfig } from '../types'

interface TraceControlsProps {
  config: TraceViewConfig
  onConfigChange: (config: Partial<TraceViewConfig>) => void
  onRefresh: () => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
}

export const TraceControls: React.FC<TraceControlsProps> = ({
  config,
  onConfigChange,
  onRefresh,
  onExpandAll,
  onCollapseAll
}) => {
  return (
    <Space>
      <Tooltip title="Refresh">
        <Button icon={<ReloadOutlined />} onClick={onRefresh} />
      </Tooltip>

      <Tooltip title="Show Minimap">
        <Switch
          checked={config.showMinimap}
          onChange={(checked) => onConfigChange({ showMinimap: checked })}
          checkedChildren="Map"
          unCheckedChildren="Map"
          size="small"
        />
      </Tooltip>

      <Tooltip title="Show Critical Path">
        <Switch
          checked={config.showCriticalPath}
          onChange={(checked) => onConfigChange({ showCriticalPath: checked })}
          checkedChildren={<ThunderboltOutlined />}
          unCheckedChildren={<ThunderboltOutlined />}
          size="small"
        />
      </Tooltip>

      <Tooltip title="Show Errors Only">
        <Switch
          checked={config.showErrors}
          onChange={(checked) => onConfigChange({ showErrors: checked })}
          checkedChildren={<BugOutlined />}
          unCheckedChildren={<BugOutlined />}
          size="small"
        />
      </Tooltip>

      <Tooltip title="Expand All">
        <Button icon={<ExpandOutlined />} onClick={onExpandAll} disabled={!onExpandAll} />
      </Tooltip>

      <Tooltip title="Collapse All">
        <Button icon={<CompressOutlined />} onClick={onCollapseAll} disabled={!onCollapseAll} />
      </Tooltip>

      <Tooltip title="Color Scheme">
        <Button
          icon={<BgColorsOutlined />}
          onClick={() => {
            const schemes: TraceViewConfig['colorScheme'][] = [
              'default',
              'service',
              'duration',
              'status'
            ]
            const currentIndex = schemes.indexOf(config.colorScheme)
            const nextIndex = (currentIndex + 1) % schemes.length
            onConfigChange({ colorScheme: schemes[nextIndex] })
          }}
        />
      </Tooltip>
    </Space>
  )
}
