import { Layer, Effect } from 'effect'
import { ResultAnalysisServiceLive } from './result-analysis-service.js'
import { ChartConfigGeneratorServiceLive } from './chart-config-generator.js'
import { DynamicComponentGeneratorServiceLive } from './dynamic-component-generator.js'

/**
 * Composite service layer that provides all UI generator services
 * The dependencies are provided in the correct order: base services first, then dependent services
 *
 * The real flow is: Service Topology → Critical Paths → Query Generation → UI Generation
 * These services support the from-sql endpoint for generating UI from query results
 */
export const UIGeneratorServicesLive = Layer.provideMerge(
  DynamicComponentGeneratorServiceLive,
  Layer.merge(ResultAnalysisServiceLive, ChartConfigGeneratorServiceLive)
)

/**
 * Convenience function to provide the composite layer with proper typing
 */
export const provideUIGeneratorServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(UIGeneratorServicesLive))
