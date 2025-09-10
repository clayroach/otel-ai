// Result Analysis Service
export {
  ResultAnalysisServiceTag,
  ResultAnalysisServiceLive,
  type ResultAnalysisService
} from './result-analysis-service.js'

// Chart Config Generator Service
export {
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceLive,
  type ChartConfigGeneratorService
} from './chart-config-generator.js'

// Dynamic Component Generator Service
export {
  DynamicComponentGeneratorServiceTag,
  DynamicComponentGeneratorServiceLive,
  type DynamicComponentGeneratorService,
  DynamicUIGenerator,
  type DynamicComponent,
  type GenerationRequest
} from './dynamic-component-generator.js'

// UI Generation Pipeline
export {
  UIGenerationPipelineServiceTag,
  UIGenerationPipelineServiceLive,
  type UIGenerationPipelineService,
  UIGenerationPipeline,
  type PipelineRequest,
  type PipelineResponse
} from './ui-generation-pipeline.js'

// Types
export type { ColumnAnalysis, ResultAnalysis, ChartAnalysisInput } from './types.js'
