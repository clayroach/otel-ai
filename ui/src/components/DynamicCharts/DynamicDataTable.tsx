import React from 'react'

interface DynamicDataTableProps {
  data: unknown[]
  loading?: boolean
  error?: string
  maxRows?: number
}

export const DynamicDataTable: React.FC<DynamicDataTableProps> = ({
  data,
  loading = false,
  error,
  maxRows = 100
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-600">Error: {error}</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded p-4">
        <p className="text-gray-600">No data available</p>
      </div>
    )
  }

  // Get column headers from first row
  const firstRow = data[0] as Record<string, unknown>
  const columns = Object.keys(firstRow)
  const displayData = data.slice(0, maxRows)

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') {
      // Format numbers with reasonable precision
      if (Number.isInteger(value)) return value.toString()
      return value.toFixed(2)
    }
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {displayData.map((row, rowIndex) => {
            const rowData = row as Record<string, unknown>
            return (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {formatCellValue(rowData[column])}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {data.length > maxRows && (
        <div className="bg-yellow-50 border-t border-yellow-200 px-4 py-2">
          <p className="text-sm text-yellow-700">
            Showing {maxRows} of {data.length} rows
          </p>
        </div>
      )}
    </div>
  )
}
