import React from 'react'

/**
 * Extracts the actual ECharts config from a wrapper object
 * LLM-generated configs may have structure: { type, title, description, config: {...} }
 * We need to extract the nested 'config' property which contains the actual ECharts options
 */
export function extractEChartsConfig(config: unknown): unknown {
  if (!config || typeof config !== 'object') {
    return config
  }

  const configObj = config as Record<string, unknown>

  // If there's a nested 'config' property, that's the actual ECharts config
  if ('config' in configObj && typeof configObj.config === 'object') {
    return configObj.config
  }

  return config
}

/**
 * Validates ECharts configuration and returns an error component if invalid
 * @param config The ECharts configuration to validate (should be already extracted)
 * @returns null if valid, or an error component if invalid
 */
export function validateChartConfig(config: unknown): React.ReactElement | null {
  if (!config) {
    return null
  }

  // Extract the actual ECharts config if it's wrapped
  const actualConfig = extractEChartsConfig(config)

  // Check if config is a string instead of an object
  if (typeof actualConfig === 'string') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
        <p className="text-yellow-800">Invalid chart configuration</p>
        <p className="text-sm text-yellow-600 mt-2">Expected chart options object, got string</p>
      </div>
    )
  }

  // Check if config is an object (but allow empty/partial configs for loading states)
  if (typeof actualConfig !== 'object') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
        <p className="text-yellow-800">Invalid chart configuration</p>
        <p className="text-sm text-yellow-600 mt-2">
          Chart config must be an object, got {typeof actualConfig}
        </p>
      </div>
    )
  }

  // Validate critical ECharts properties that MUST be objects/arrays, not strings
  // These are used by ECharts internally with the 'in' operator
  const chartConfig = actualConfig as Record<string, unknown>
  const criticalProperties = ['xAxis', 'yAxis', 'series', 'grid', 'dataset']

  for (const prop of criticalProperties) {
    if (prop in chartConfig && chartConfig[prop] !== null && chartConfig[prop] !== undefined) {
      const value = chartConfig[prop]
      const valueType = typeof value

      // xAxis, yAxis, grid can be object or array (but not string/number/boolean)
      if (['xAxis', 'yAxis', 'grid'].includes(prop)) {
        if (valueType !== 'object') {
          return (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <p className="text-yellow-800">Invalid chart configuration</p>
              <p className="text-sm text-yellow-600 mt-2">
                Property "{prop}" must be an object or array
              </p>
            </div>
          )
        }
      }

      // series must be an array
      if (prop === 'series') {
        if (!Array.isArray(value)) {
          return (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <p className="text-yellow-800">Invalid chart configuration</p>
              <p className="text-sm text-yellow-600 mt-2">Property "series" must be an array</p>
            </div>
          )
        }

        // Validate each series item is an object, not a string
        for (let i = 0; i < value.length; i++) {
          const item = value[i]
          const itemType = typeof item
          if (itemType !== 'object' || item === null) {
            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <p className="text-yellow-800">Invalid chart configuration</p>
                <p className="text-sm text-yellow-600 mt-2">
                  Series item at index {i} must be an object
                </p>
              </div>
            )
          }
        }
      }

      // dataset must be an object
      if (prop === 'dataset' && (valueType !== 'object' || Array.isArray(value))) {
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-yellow-800">Invalid chart configuration</p>
            <p className="text-sm text-yellow-600 mt-2">Property "dataset" must be an object</p>
          </div>
        )
      }
    }
  }

  // Note: Other properties like 'title' can be strings or objects - we only validate
  // the critical structural properties that ECharts uses with the 'in' operator.
  // The try-catch in the chart component will handle any remaining rendering errors.

  return null
}
