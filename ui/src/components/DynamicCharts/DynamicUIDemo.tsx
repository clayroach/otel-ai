import React, { useState } from 'react'
import { useUIGeneration } from '../../hooks/useUIGeneration'
import { DynamicChartRenderer } from './DynamicChartRenderer'

export const DynamicUIDemo: React.FC = () => {
  const { data, loading, error, generateUI, reset } = useUIGeneration()
  const [query, setQuery] = useState('')

  const exampleQueries = [
    'Show service latency over the last 15 minutes',
    'Compare error counts across all services',
    'Show request count per minute for the last hour',
    'Display p95 latency trends for frontend service',
    'Analyze throughput patterns for checkout service'
  ]

  const handleGenerate = async () => {
    if (!query.trim()) return
    try {
      await generateUI(query)
    } catch (err) {
      console.error('Generation failed:', err)
    }
  }

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dynamic UI Generation Demo</h1>
        <p className="text-gray-600">
          Generate visualizations from natural language queries using AI
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="mb-4">
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
            Natural Language Query
          </label>
          <div className="flex gap-2">
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Show service latency over the last hour"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
            {data && (
              <button
                onClick={reset}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">Try these examples:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="text-red-800 font-medium mb-1">Generation Error</h3>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {data.component.title || 'Generated Visualization'}
            </h2>
            {data.component.description && (
              <p className="text-gray-600 mb-4">{data.component.description}</p>
            )}
            <DynamicChartRenderer
              component={data.component}
              loading={loading}
              error={error || undefined}
            />
          </div>

          <details className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <summary className="cursor-pointer font-medium text-gray-700">
              Generation Details
            </summary>
            <div className="mt-4 space-y-3">
              <div>
                <h4 className="font-medium text-gray-700">SQL Query:</h4>
                <pre className="mt-1 p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto">
                  {data.query.sql}
                </pre>
              </div>
              <div>
                <h4 className="font-medium text-gray-700">Metadata:</h4>
                <ul className="mt-1 text-sm text-gray-600">
                  <li>Model: {data.query.model}</li>
                  <li>Generation Time: {data.query.generationTime}ms</li>
                  <li>Total Time: {data.metadata.totalTime}ms</li>
                  <li>Row Count: {data.results.rowCount}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-700">Pipeline Steps:</h4>
                <ul className="mt-1 text-sm">
                  {data.metadata.steps.map((step, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          step.status === 'success'
                            ? 'bg-green-500'
                            : step.status === 'error'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-gray-700">{step.name}</span>
                      <span className="text-gray-500">({step.duration}ms)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
