/**
 * AI Analyzer Service Integration
 * 
 * Connects the UI to the backend AI analyzer service for real-time analysis.
 */

import axios from 'axios';
import type {
  AnalysisRequest,
  AnalysisResult,
  ServiceTopology,
  ApplicationArchitecture
} from '../views/InsightsView/mockData';

// API client configuration
const apiClient = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4319/api',
  timeout: 30000, // 30 second timeout for AI analysis
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log('AI Analyzer API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('AI Analyzer API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * AI Analyzer Service
 */
export class AIAnalyzerService {
  /**
   * Perform a complete AI analysis
   */
  static async analyzeArchitecture(request: AnalysisRequestParams): Promise<AnalysisResult> {
    const response = await apiClient.post('/ai-analyzer/analyze', {
      type: request.type,
      timeRange: {
        startTime: request.timeRange.startTime.toISOString(),
        endTime: request.timeRange.endTime.toISOString()
      },
      filters: request.filters,
      config: {
        llm: {
          model: 'claude',
          temperature: 0.1,
          maxTokens: 4000
        },
        analysis: {
          timeWindowHours: Math.abs(
            request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()
          ) / (1000 * 60 * 60),
          minSpanCount: 100,
          serviceFilterPattern: request.filters?.services?.join('|')
        },
        output: {
          format: 'markdown',
          includeDigrams: true,
          detailLevel: 'comprehensive'
        }
      }
    });

    return {
      ...response.data,
      // Ensure dates are properly parsed
      architecture: response.data.architecture ? {
        ...response.data.architecture,
        generatedAt: new Date(response.data.architecture.generatedAt)
      } : undefined
    };
  }

  /**
   * Stream analysis results in real-time
   */
  static async* streamAnalysis(request: AnalysisRequestParams): AsyncGenerator<string, void, unknown> {
    try {
      const response = await fetch(`http://localhost:4319/api/ai-analyzer/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: request.type,
          timeRange: {
            startTime: request.timeRange.startTime.toISOString(),
            endTime: request.timeRange.endTime.toISOString()
          },
          filters: request.filters,
          config: {
            llm: {
              model: 'claude',
              temperature: 0.1,
              maxTokens: 4000
            },
            streaming: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              // Handle Server-Sent Events format
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data !== '[DONE]') {
                  yield data;
                }
              } else {
                yield line;
              }
            } catch (e) {
              // If not JSON, yield as plain text
              yield line;
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming analysis error:', error);
      throw error;
    }
  }

  /**
   * Get service topology for a specific time range
   */
  static async getServiceTopology(timeRange: { startTime: Date; endTime: Date }): Promise<ServiceTopology[]> {
    const response = await apiClient.post('/ai-analyzer/topology', {
      timeRange: {
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString()
      }
    });

    return response.data;
  }

  /**
   * Generate documentation for an architecture
   */
  static async generateDocumentation(architecture: ApplicationArchitecture): Promise<{ markdown: string }> {
    const response = await apiClient.post('/ai-analyzer/documentation', {
      architecture: {
        ...architecture,
        generatedAt: architecture.generatedAt.toISOString()
      }
    });

    return response.data;
  }

  /**
   * Health check for the AI analyzer service
   */
  static async healthCheck(): Promise<{ status: string; capabilities: string[] }> {
    try {
      const response = await apiClient.get('/ai-analyzer/health');
      return response.data;
    } catch (error) {
      return {
        status: 'unavailable',
        capabilities: []
      };
    }
  }
}

/**
 * Request parameters interface
 */
export interface AnalysisRequestParams {
  type: 'architecture' | 'dataflow' | 'dependencies' | 'insights';
  timeRange: {
    startTime: Date;
    endTime: Date;
  };
  filters?: {
    services?: string[];
    operations?: string[];
    traceIds?: string[];
  };
}

/**
 * Hook for using AI analyzer with React Query
 */
export const useAIAnalyzer = () => {
  return {
    analyzeArchitecture: AIAnalyzerService.analyzeArchitecture,
    streamAnalysis: AIAnalyzerService.streamAnalysis,
    getServiceTopology: AIAnalyzerService.getServiceTopology,
    generateDocumentation: AIAnalyzerService.generateDocumentation,
    healthCheck: AIAnalyzerService.healthCheck
  };
};

/**
 * Default export
 */
export default AIAnalyzerService;