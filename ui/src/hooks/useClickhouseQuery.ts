import { useQuery, UseQueryOptions } from 'react-query'
import axios from 'axios'
import { useAppStore } from '../store/appStore'

export interface ClickhouseQueryResult<T = unknown> {
  data: T[]
  rows: number
  statistics: {
    elapsed: number
    rows_read: number
    bytes_read: number
  }
  meta?: Array<{
    name: string
    type: string
  }>
}

interface ClickhouseError {
  message: string
  code?: number
}

const executeClickhouseQuery = async <T = unknown>(
  query: string,
  url: string,
  auth: { username: string; password: string }
): Promise<ClickhouseQueryResult<T>> => {
  try {
    // For proxy URLs, don't send auth headers as the proxy handles authentication
    const isProxyUrl = url.includes('/api/clickhouse')
    console.log('ClickHouse Query URL:', url, 'isProxy:', isProxyUrl)

    const headers: Record<string, string> = {}

    if (!isProxyUrl) {
      headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`
    }

    const response = await axios.post(url, `${query} FORMAT JSON`, {
      headers: {
        ...headers,
        'Content-Type': 'text/plain'
      },
      timeout: 30000 // 30 second timeout
    })

    // ClickHouse returns JSON with data, rows, statistics, and optionally meta
    const result = response.data

    return {
      data: result.data || [],
      rows: result.rows || 0,
      statistics: result.statistics || {
        elapsed: 0,
        rows_read: 0,
        bytes_read: 0
      },
      meta: result.meta
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Handle ClickHouse error responses
      if (error.response?.data) {
        const errorText =
          typeof error.response.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response.data)

        // Extract ClickHouse error message
        const match = errorText.match(/Code: (\d+)\. (.+?)(?:\n|$)/)
        if (match) {
          const [, code, message] = match
          throw new Error(`ClickHouse Error ${code}: ${message}`)
        }

        throw new Error(`ClickHouse Error: ${errorText}`)
      }

      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          'Cannot connect to ClickHouse. Please check if ClickHouse is running and accessible.'
        )
      }

      if (error.code === 'ETIMEDOUT') {
        throw new Error('Query timeout. The query took too long to execute.')
      }

      throw new Error(`Network Error: ${error.message}`)
    }

    throw error
  }
}

export const useClickhouseQuery = <T = unknown>(
  query: string,
  options?: Omit<UseQueryOptions<ClickhouseQueryResult<T>, ClickhouseError>, 'queryKey' | 'queryFn'>
) => {
  const { clickhouseUrl, clickhouseAuth } = useAppStore()

  return useQuery<ClickhouseQueryResult<T>, ClickhouseError>({
    queryKey: ['clickhouse-query', query, clickhouseUrl, clickhouseAuth],
    queryFn: () => executeClickhouseQuery<T>(query, clickhouseUrl, clickhouseAuth),
    enabled: Boolean(query.trim()) && Boolean(clickhouseUrl),
    retry: (failureCount, error) => {
      // Don't retry on syntax errors or connection issues
      if (
        error.message.includes('Syntax error') ||
        error.message.includes('Cannot connect') ||
        error.message.includes('Authentication failed')
      ) {
        return false
      }
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options
  })
}

// Hook for testing connection
export const useClickhouseConnection = () => {
  const { clickhouseUrl, clickhouseAuth } = useAppStore()

  return useQuery<boolean, ClickhouseError>({
    queryKey: ['clickhouse-connection', clickhouseUrl, clickhouseAuth],
    queryFn: async () => {
      try {
        await executeClickhouseQuery('SELECT 1', clickhouseUrl, clickhouseAuth)
        return true
      } catch (error) {
        throw error
      }
    },
    enabled: Boolean(clickhouseUrl),
    retry: false,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}
