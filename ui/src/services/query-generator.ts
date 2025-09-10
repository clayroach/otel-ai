/**
 * Query Generator Service Integration
 *
 * Generates diagnostic ClickHouse queries from critical paths using LLMs.
 * Follows the same pattern as the AI Analyzer service.
 */

import axios from 'axios'
import type { CriticalPath } from '../components/ServiceTopology/types'

// API client configuration
const apiClient = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4319/api',
  timeout: 15000, // 15 second timeout for query generation
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log('Query Generator API Request:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Query Generator API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

/**
 * Query generation result
 */
export interface QueryGenerationResult {
  sql: string
  model: string
  generationTime: number
  description?: string
  criticalPath?: string
  analysisType?: 'latency' | 'errors' | 'bottlenecks' | 'throughput' | 'general'
}

/**
 * Query generation request
 */
export interface QueryGenerationRequest {
  path: CriticalPath
  analysisGoal?: string
  preferredModel?: string
  timeWindowMinutes?: number
}

/**
 * Available LLM model information
 */
export interface LLMModel {
  name: string
  provider: string
  description: string
  available: boolean
}

/**
 * Query Generator Service
 */
export class QueryGeneratorService {
  /**
   * Generate a diagnostic query from a critical path
   */
  static async generateQuery(request: QueryGenerationRequest): Promise<QueryGenerationResult> {
    const startTime = Date.now()

    try {
      const response = await apiClient.post('/ui-generator/generate-query', {
        path: {
          id: request.path.id,
          name: request.path.name,
          services: request.path.services,
          startService: request.path.services[0],
          endService: request.path.services[request.path.services.length - 1]
        },
        analysisGoal:
          request.analysisGoal || QueryGeneratorService.determineAnalysisGoal(request.path),
        model: request.preferredModel,
        timeWindowMinutes: request.timeWindowMinutes
      })

      return {
        sql: response.data.sql,
        model: response.data.model || 'claude-3-haiku-20240307',
        generationTime: response.data.generationTimeMs || Date.now() - startTime,
        description: response.data.description,
        criticalPath: request.path.name,
        analysisType: response.data.analysisType
      }
    } catch (error) {
      console.error('Query generation failed:', error)
      // Return a fallback query if API fails
      return QueryGeneratorService.generateFallbackQuery(request.path, Date.now() - startTime)
    }
  }

  /**
   * Get available LLM models for query generation
   */
  static async getAvailableModels(): Promise<LLMModel[]> {
    try {
      const response = await apiClient.get('/ui-generator/models')
      return response.data.models
    } catch (error) {
      // Return default models if API fails
      return [
        {
          name: 'claude-3-haiku-20240307',
          provider: 'anthropic',
          description: 'Claude 3.5 Sonnet - Best for complex SQL generation',
          available: false
        },
        {
          name: 'gpt-4o',
          provider: 'openai',
          description: 'GPT-4 Optimized - Good balance of speed and quality',
          available: false
        },
        {
          name: 'rule-based',
          provider: 'local',
          description: 'Rule-based - Fast local generation',
          available: true
        }
      ]
    }
  }

  /**
   * Validate a SQL query for safety and correctness
   */
  static validateQuery(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const upperSQL = sql.toUpperCase()

    // Check for required elements
    if (!upperSQL.includes('SELECT')) {
      errors.push('Query must contain SELECT statement')
    }
    if (!upperSQL.includes('FROM')) {
      errors.push('Query must specify FROM table')
    }

    // Check for dangerous operations
    const forbidden = [
      'DROP',
      'DELETE',
      'TRUNCATE',
      'ALTER',
      'CREATE',
      'INSERT',
      'UPDATE',
      'GRANT',
      'REVOKE'
    ]
    for (const op of forbidden) {
      if (upperSQL.includes(op)) {
        errors.push(`Forbidden operation: ${op}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get the currently selected model from local storage
   */
  static getSelectedModel(): string {
    return localStorage.getItem('preferred-llm-model') || 'claude-3-haiku-20240307'
  }

  /**
   * Set the preferred model in local storage
   */
  static setSelectedModel(model: string): void {
    localStorage.setItem('preferred-llm-model', model)
  }

  /**
   * Private: Determine analysis goal based on path metrics
   */
  private static determineAnalysisGoal(path: CriticalPath): string {
    const { errorRate, p99Latency } = path.metrics

    if (errorRate > 0.05) {
      return 'Identify error patterns, distribution, and root causes across services to improve reliability'
    } else if (p99Latency > 2000) {
      return 'Detect performance bottlenecks by finding slowest operations and their impact on the critical path'
    } else if (p99Latency > 1000) {
      return 'Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring'
    } else {
      return 'Measure request volume, throughput rates, and success ratios to understand system capacity'
    }
  }

  /**
   * Private: Generate a fallback query when API is unavailable
   */
  private static generateFallbackQuery(
    path: CriticalPath,
    generationTime: number
  ): QueryGenerationResult {
    const services = path.services.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')

    // Determine analysis type based on metrics
    const analysisType =
      path.metrics.errorRate > 0.05
        ? 'errors'
        : path.metrics.p99Latency > 2000
          ? 'bottlenecks'
          : path.metrics.p99Latency > 1000
            ? 'latency'
            : 'general'

    const sql = `-- Fallback diagnostic query for ${path.name}
SELECT 
  service_name,
  toStartOfMinute(start_time) as minute,
  count() as request_count,
  quantile(0.5)(duration_ns/1000000) as p50_ms,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  quantile(0.99)(duration_ns/1000000) as p99_ms,
  sum(CASE WHEN status_code != 'OK' THEN 1 ELSE 0 END) as error_count,
  round(sum(CASE WHEN status_code != 'OK' THEN 1 ELSE 0 END) * 100.0 / count(), 2) as error_rate
FROM otel.traces
WHERE 
  service_name IN (${services})
  AND start_time >= now() - INTERVAL 1 HOUR
GROUP BY service_name, minute
ORDER BY minute DESC, service_name
LIMIT 1000`

    return {
      sql,
      model: 'fallback',
      generationTime,
      description: 'Fallback query - API unavailable',
      criticalPath: path.name,
      analysisType
    }
  }
}

/**
 * Hook for using query generator with React
 */
export const useQueryGenerator = () => {
  return {
    generateQuery: QueryGeneratorService.generateQuery,
    getAvailableModels: QueryGeneratorService.getAvailableModels,
    validateQuery: QueryGeneratorService.validateQuery,
    getSelectedModel: QueryGeneratorService.getSelectedModel,
    setSelectedModel: QueryGeneratorService.setSelectedModel
  }
}

/**
 * Default export
 */
export default QueryGeneratorService
