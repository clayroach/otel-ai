import React from 'react'
import { Segmented, Tooltip } from 'antd'
import { 
  TableOutlined, 
  LineChartOutlined, 
  BarChartOutlined, 
  HeatMapOutlined,
  PieChartOutlined,
  DotChartOutlined 
} from '@ant-design/icons'
import type { ChartType } from '../../services/result-analysis'

/**
 * VisualizationToggle Component
 * 
 * Allows users to switch between different visualization types.
 * Shows recommended option with a badge and provides tooltips explaining when each chart is optimal.
 */

interface VisualizationOption {
  value: ChartType
  label: string
  icon: React.ReactNode
  description: string
}

const VISUALIZATION_OPTIONS: VisualizationOption[] = [
  {
    value: 'table',
    label: 'Table',
    icon: <TableOutlined />,
    description: 'Raw data view with sortable columns and detailed formatting'
  },
  {
    value: 'line-chart',
    label: 'Line Chart',
    icon: <LineChartOutlined />,
    description: 'Perfect for time-series data and trend analysis'
  },
  {
    value: 'bar-chart', 
    label: 'Bar Chart',
    icon: <BarChartOutlined />,
    description: 'Great for comparing categories and discrete values'
  },
  {
    value: 'heatmap',
    label: 'Heatmap',
    icon: <HeatMapOutlined />,
    description: 'Shows correlation patterns and density distributions'
  },
  {
    value: 'pie-chart',
    label: 'Pie Chart',
    icon: <PieChartOutlined />,
    description: 'Visualizes proportional data and percentages'
  },
  {
    value: 'scatter-plot',
    label: 'Scatter',
    icon: <DotChartOutlined />,
    description: 'Reveals relationships between two numeric variables'
  }
]

interface VisualizationToggleProps {
  value: ChartType
  onChange: (value: ChartType) => void
  recommendedType?: ChartType
  availableTypes?: ChartType[]
  disabled?: boolean
}

export const VisualizationToggle: React.FC<VisualizationToggleProps> = ({
  value,
  onChange,
  recommendedType,
  availableTypes = ['table'],
  disabled = false
}) => {
  // Filter options to only show available types
  const availableOptions = VISUALIZATION_OPTIONS.filter(option =>
    availableTypes.includes(option.value)
  )

  // Create options for Segmented component
  const segmentedOptions = availableOptions.map(option => ({
    value: option.value,
    label: (
      <Tooltip title={option.description}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {option.icon}
          <span>{option.label}</span>
          {recommendedType === option.value && (
            <span
              style={{
                backgroundColor: '#52c41a',
                color: 'white',
                fontSize: '10px',
                padding: '1px 4px',
                borderRadius: '2px',
                marginLeft: '4px'
              }}
            >
              AI
            </span>
          )}
        </div>
      </Tooltip>
    )
  }))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '12px', color: '#8c8c8c' }}>View:</span>
      <Segmented
        value={value}
        onChange={onChange}
        options={segmentedOptions}
        disabled={disabled}
        size="small"
      />
      {recommendedType && recommendedType !== value && (
        <Tooltip title={`AI recommends ${VISUALIZATION_OPTIONS.find(opt => opt.value === recommendedType)?.label} for this data pattern`}>
          <div style={{ fontSize: '11px', color: '#52c41a', cursor: 'help' }}>
            💡 Try {VISUALIZATION_OPTIONS.find(opt => opt.value === recommendedType)?.label}
          </div>
        </Tooltip>
      )}
    </div>
  )
}

export default VisualizationToggle