import { Layer, Effect } from 'effect'
import { ResultAnalysisServiceLive } from './result-analysis-service.js'
import { ChartConfigGeneratorServiceLive } from './chart-config-generator.js'
import { DynamicComponentGeneratorServiceLive } from './dynamic-component-generator.js'
import { UIGenerationPipelineServiceLive } from './ui-generation-pipeline.js'

/**
 * Composite service layer that provides all UI generator services
 * The dependencies are provided in the correct order: base services first, then dependent services
 */
export const UIGeneratorServicesLive = Layer.provideMerge(
  DynamicComponentGeneratorServiceLive,
  Layer.merge(ResultAnalysisServiceLive, ChartConfigGeneratorServiceLive)
)

/**
 * Full pipeline layer including UI generation pipeline service
 */
export const UIGeneratorPipelineServicesLive = Layer.provideMerge(
  UIGenerationPipelineServiceLive,
  UIGeneratorServicesLive
)

/**
 * Convenience function to provide the composite layer with proper typing
 */
export const provideUIGeneratorServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(UIGeneratorServicesLive))
